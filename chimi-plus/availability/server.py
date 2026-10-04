#!/usr/bin/env python3
"""Chimi+ release availability: read-only authenticated, on-demand Prowlarr search."""
import json, os, re, time, threading, urllib.request, urllib.parse, urllib.error, unicodedata, xml.etree.ElementTree as ET
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

def get_json(url, headers, timeout=12):
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=timeout) as res:
        return json.load(res)

def normalized(s):
    s = unicodedata.normalize('NFKD', s.lower())
    s = ''.join(c for c in s if not unicodedata.combining(c))
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()

def matching(release, title, year):
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
    def do_GET(self):
        p=urllib.parse.urlparse(self.path)
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
