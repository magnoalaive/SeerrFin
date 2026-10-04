#!/usr/bin/env python3
"""Chimi+ release availability: read-only authenticated, on-demand Prowlarr search."""
import json, os, re, time, threading, urllib.request, urllib.parse, urllib.error, unicodedata, xml.etree.ElementTree as ET, html
from concurrent.futures import ThreadPoolExecutor, as_completed
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import catalog_feed

HOME = Path.home()
PROWLARR_CONFIG = HOME / 'AlaiveServer/data/chimiplus/prowlarr/config.xml'
BASE = 'http://192.168.3.41'
CACHE = {}
LOCK = threading.Lock()
TTL = 900
MAX = 100
ASC_UPSTREAM = 'https://amigos-share.club'
ASC_RESOLUTION_CACHE = {}
ASC_RESOLUTION_LOCK = threading.Lock()
ASC_RESOLUTION_TTL = 7 * 24 * 3600

def get_json(url, headers, timeout=12):
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=timeout) as res:
        return json.load(res)

def normalized(s):
    s = unicodedata.normalize('NFKD', s.lower())
    s = ''.join(c for c in s if not unicodedata.combining(c))
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()

def matching(release, title, year):
    # Match complete leading movie title + explicit release year; prevent homonym false positives.
    name = normalized(release)
    key = normalized(title)
    return bool(re.match(r'^' + re.escape(key) + r'\s+' + re.escape(str(year)) + r'(?:\s|$)', name))

def matching_tv(release, title, season):
    name = normalized(release)
    key = normalized(title)
    season_token = r's0*' + str(season) + r'(?:e\d+|\b)'
    return bool(re.match(r'^' + re.escape(key) + r'\s+(?:\d{4}\s+)?' + season_token, name))

def quality(name):
    name = name.lower()
    if re.search(r'2160p|4k|uhd', name): return '4K'
    if re.search(r'1080p', name): return '1080p'
    if re.search(r'720p', name): return '720p'
    if re.search(r'480p|576p|\bsd\b', name): return 'SD'
    return 'Outros'

def asc_headers(cookie, user_agent=''):
    return {
        'Cookie': cookie,
        'User-Agent': user_agent or 'Mozilla/5.0 Chimi-ASC-Proxy',
        'Accept': 'text/html,application/xhtml+xml,application/octet-stream,*/*;q=0.8',
        'Accept-Encoding': 'identity',
    }

def asc_get(path, query, cookie, user_agent='', timeout=15):
    url = ASC_UPSTREAM + path + (('?' + query) if query else '')
    request = urllib.request.Request(url, headers=asc_headers(cookie, user_agent))
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, response.headers, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.headers, error.read()

def parse_inertia_page(body):
    text = body.decode('utf-8', 'replace')
    match = re.search(r'(<script[^>]+data-page=[\"\']app[\"\'][^>]*>)(.*?)(</script>)', text, re.S | re.I)
    if not match:
        raise ValueError('Inertia data-page script not found')
    payload = match.group(2)
    try:
        return text, match, json.loads(payload), False
    except json.JSONDecodeError:
        return text, match, json.loads(html.unescape(payload)), True

def find_torrent_rows(value):
    if isinstance(value, dict):
        torrents = value.get('torrents')
        if isinstance(torrents, dict) and isinstance(torrents.get('data'), list):
            return torrents['data']
        for child in value.values():
            found = find_torrent_rows(child)
            if found is not None: return found
    elif isinstance(value, list):
        for child in value:
            found = find_torrent_rows(child)
            if found is not None: return found
    return None

def normalize_resolution(value):
    if value is None: return None
    text = json.dumps(value, ensure_ascii=False) if isinstance(value, (dict, list)) else str(value)
    text = text.lower()
    if re.search(r'2160|\b4k\b|uhd', text): return '2160p'
    if '1080' in text: return '1080p'
    if '720' in text: return '720p'
    if '576' in text: return '576p'
    if '480' in text: return '480p'
    return None

def asc_resolution(torrent_id, cookie, user_agent=''):
    now = time.monotonic()
    with ASC_RESOLUTION_LOCK:
        cached = ASC_RESOLUTION_CACHE.get(torrent_id)
        if cached and now - cached[0] < ASC_RESOLUTION_TTL:
            return cached[1]
    status, _, body = asc_get('/torrents/' + str(torrent_id), '', cookie, user_agent, 12)
    resolution = None
    if status == 200:
        try:
            _, _, page, _ = parse_inertia_page(body)
            torrent = (page.get('props') or {}).get('torrent') or {}
            attributes = torrent.get('attributes') or {}
            raw_resolution = attributes.get('resolution')
            resolution = normalize_resolution(raw_resolution)
            if not resolution:
                description = json.dumps(torrent.get('descriptionTree') or [], ensure_ascii=False)
                resolution = normalize_resolution(description)
        except Exception:
            resolution = None
    with ASC_RESOLUTION_LOCK:
        if len(ASC_RESOLUTION_CACHE) > 1000: ASC_RESOLUTION_CACHE.clear()
        ASC_RESOLUTION_CACHE[torrent_id] = (now, resolution)
    return resolution

def enrich_asc_search(body, cookie, user_agent=''):
    text, match, page, entity_encoded = parse_inertia_page(body)
    rows = find_torrent_rows(page) or []
    pending = []
    for row in rows:
        if not isinstance(row, dict): continue
        badges = row.get('badges') if isinstance(row.get('badges'), list) else []
        if any(isinstance(badge, dict) and (badge.get('kind') == 'resolution' or normalize_resolution(badge.get('label'))) for badge in badges):
            continue
        torrent_id = row.get('id')
        if isinstance(torrent_id, int) and torrent_id > 0:
            pending.append((torrent_id, row))
    enriched = 0
    if pending:
        with ThreadPoolExecutor(max_workers=min(6, len(pending))) as pool:
            futures = {pool.submit(asc_resolution, torrent_id, cookie, user_agent): row for torrent_id, row in pending}
            for future in as_completed(futures):
                resolution = future.result()
                if not resolution: continue
                row = futures[future]
                badges = row.get('badges') if isinstance(row.get('badges'), list) else []
                row['badges'] = [{'label': resolution, 'kind': 'resolution'}] + badges
                enriched += 1
    if not enriched: return body, 0
    payload = json.dumps(page, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
    if entity_encoded: payload = html.escape(payload, quote=True)
    updated = text[:match.start(2)] + payload + text[match.end(2):]
    return updated.encode('utf-8'), enriched

class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print('%s %s' % (self.log_date_time_string(), fmt % args),flush=True)
    def send(self, status, body):
        b = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type','application/json; charset=utf-8')
        self.send_header('Cache-Control','private, no-store')
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Content-Length',str(len(b)))
        self.end_headers()
        self.wfile.write(b)
    def proxy_asc(self, parsed):
        path = parsed.path
        if path != '/dashboard' and path != '/torrents' and not re.fullmatch(r'/torrents/\d+(?:/download)?', path):
            return self.send(404, {'error':'not found'})
        cookie = self.headers.get('Cookie','')
        if not cookie or len(cookie) > 16384:
            return self.send(401, {'error':'ASC cookie required'})
        try:
            status, headers, body = asc_get(path, parsed.query, cookie, self.headers.get('User-Agent',''), 20)
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            print('ASC proxy failed:', type(error).__name__, flush=True)
            return self.send(502, {'error':'ASC temporarily unavailable'})
        if status == 200 and path == '/torrents':
            try:
                body, enriched = enrich_asc_search(body, cookie, self.headers.get('User-Agent',''))
                if enriched: print('ASC metadata enriched:', enriched, 'release(s)', flush=True)
            except Exception as error:
                print('ASC enrichment skipped:', type(error).__name__, flush=True)
        self.send_response(status)
        self.send_header('Content-Type', headers.get('Content-Type','application/octet-stream'))
        disposition = headers.get('Content-Disposition')
        if disposition: self.send_header('Content-Disposition', disposition)
        self.send_header('Cache-Control','private, no-store')
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Content-Length',str(len(body)))
        self.end_headers()
        self.wfile.write(body)
    def do_GET(self):
        p=urllib.parse.urlparse(self.path)
        if p.path == '/dashboard' or p.path == '/torrents' or re.fullmatch(r'/torrents/\d+(?:/download)?', p.path):
            return self.proxy_asc(p)
        if p.path == '/healthz': return self.send(200,{'status':'ok'})
        if p.path == '/catalog':
            cookie=self.headers.get('Cookie','')
            if not cookie or len(cookie)>8192: return self.send(401,{'error':'login required'})
            try:
                get_json(BASE+':'+os.getenv('SEERR_PORT','5057')+'/api/v1/auth/me',{'Cookie':cookie,'Accept':'application/json'},4)
            except (urllib.error.HTTPError,urllib.error.URLError,TimeoutError):
                return self.send(401,{'error':'Jellyseerr authentication required'})
            try: return self.send(200,catalog_feed.recent())
            except Exception as error:
                print('Catalog retrieval failed:',type(error).__name__,flush=True)
                return self.send(502,{'error':'ASC catalog temporarily unavailable'})
        if p.path != '/availability': return self.send(404,{'error':'not found'})
        q=urllib.parse.parse_qs(p.query)
        try:
            tmdb=int(q.get('tmdbId',[''])[0])
            if not 1 <= tmdb <= 999999999: raise ValueError()
        except (ValueError,IndexError): return self.send(400,{'error':'invalid movie id'})
        media_type=q.get('type',['movie'])[0]
        if media_type not in ('movie','tv'): return self.send(400,{'error':'invalid media type'})
        try:
            season=int(q.get('season',['1'])[0]) if media_type=='tv' else 0
            if media_type=='tv' and not 1<=season<=99: raise ValueError()
        except ValueError: return self.send(400,{'error':'invalid season'})
        cookie=self.headers.get('Cookie','')
        if not cookie or len(cookie)>8192: return self.send(401,{'error':'login required'})
        auth={'Cookie':cookie,'Accept':'application/json'}
        try:
            get_json(BASE+':'+os.getenv('SEERR_PORT','5057')+'/api/v1/auth/me',auth,4)
            movie=get_json(BASE+':'+os.getenv('SEERR_PORT','5057')+'/api/v1/'+media_type+'/'+str(tmdb),auth,5)
        except (urllib.error.HTTPError,urllib.error.URLError,TimeoutError):
            return self.send(401,{'error':'Jellyseerr authentication required'})
        lookup_title=(movie.get('originalName') or movie.get('name') or '') if media_type=='tv' else (movie.get('originalTitle') or movie.get('title') or '')
        display_title=(movie.get('name') or lookup_title) if media_type=='tv' else (movie.get('title') or lookup_title)
        imdb_id=movie.get('imdbId') or (movie.get('externalIds') or {}).get('imdbId')
        date=(movie.get('firstAirDate') or '') if media_type=='tv' else (movie.get('releaseDate') or '')
        year=date[:4]
        if not lookup_title or (media_type=='movie' and not re.fullmatch(r'\d{4}',year)):
            return self.send(422,{'error':'title or year unavailable'})
        if media_type=='tv' and season not in [s.get('seasonNumber') for s in movie.get('seasons',[]) if isinstance(s,dict)]:
            return self.send(422,{'error':'season not listed for this series'})
        key=(media_type,tmdb,lookup_title,display_title,imdb_id,year,season)
        with LOCK:
            cached=CACHE.get(key)
            if cached and time.monotonic()-cached[0]<TTL:
                return self.send(200,dict(cached[1],cached=True))
        try:
            token=ET.parse(PROWLARR_CONFIG).getroot().findtext('ApiKey')
            use_imdb=media_type=='movie' and bool(re.fullmatch(r'tt\d+',imdb_id or ''))
            search_term=(lookup_title+' S'+str(season).zfill(2)) if media_type=='tv' else (imdb_id if use_imdb else lookup_title+' '+year)
            category='5000' if media_type=='tv' else '2000'
            params=urllib.parse.urlencode({'query':search_term,'type':'search','indexerIds':'2','categories':category})
            records=get_json(BASE+':9696/api/v1/search?'+params,{'X-Api-Key':token},18)
        except Exception as e:
            print('Indexer search failed:',type(e).__name__,flush=True)
            return self.send(502,{'error':'indexer temporarily unavailable'})
        results=[]
        for rec in records:
            name=rec.get('title','')
            matched=matching_tv(name,lookup_title,season) if media_type=='tv' else (use_imdb or matching(name,lookup_title,year))
            if not matched: continue
            results.append({'title':name[:240],'quality':quality(name),'sizeGB':round((rec.get('size') or 0)/(1024**3),2),
                'seeders':rec.get('seeders'),'indexer':rec.get('indexer'),'published':rec.get('publishDate')})
            if len(results)>=MAX:break
        order={'4K':0,'1080p':1,'720p':2,'SD':3,'Outros':4}
        results.sort(key=lambda r:order.get(r['quality'],5))
        result={'title':display_title,'year':year,'mediaType':media_type,'season':season,'releases':results,'checkedAt':int(time.time()),'cached':False}
        with LOCK:
            if len(CACHE)>150: CACHE.clear()
            CACHE[key]=(time.monotonic(),result)
        return self.send(200,result)

if __name__=='__main__':
    ThreadingHTTPServer(('192.168.3.41',8769),Handler).serve_forever()
