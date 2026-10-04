"""Read-only ASC recent movie catalogue. One Prowlarr query per hour."""
import json, re, threading, time, urllib.parse, urllib.request, xml.etree.ElementTree as ET
from pathlib import Path

CONFIG = Path.home()/'AlaiveServer/data/chimiplus/prowlarr/config.xml'
CACHE = None
EXPIRES = 0
LOCK = threading.Lock()
NAME_YEAR = re.compile(r'^(.{2,120}?)\s+((?:19|20)\d{2})(?=\s|$)')
def movie_key(name):
    match = NAME_YEAR.match(name or '')
    if not match: return None
    title = match.group(1).strip(' .-_')
    if len(title)<2: return None
    return title, match.group(2)
def classification(s):
    s=s.lower()
    if re.search(r'2160p|4k|uhd',s): return '4K'
    if '1080p' in s: return '1080p'
    if '720p' in s: return '720p'
    if re.search(r'\bsd\b|480p|576p',s): return 'SD'
    return 'Outro'
def recent():
    global CACHE, EXPIRES
    if CACHE is not None and time.monotonic()<EXPIRES: return CACHE
    with LOCK:
        if CACHE is not None and time.monotonic()<EXPIRES: return CACHE
        token=ET.parse(CONFIG).getroot().findtext('ApiKey')
        params=urllib.parse.urlencode({'type':'search','indexerIds':'2','categories':'2000'})
        req=urllib.request.Request('http://192.168.3.41:9696/api/v1/search?'+params, headers={'X-Api-Key':token})
        with urllib.request.urlopen(req,timeout=25) as response: data=json.load(response)
        grouped={}
        for row in data:
            if row.get('indexerId')!=2: continue
            parsed=movie_key(row.get('title',''))
            if not parsed: continue
            title,year=parsed
            key=(title.casefold(),year)
            if key not in grouped:
                grouped[key]={'title':title,'year':year,'published':row.get('publishDate',''),
                    'qualities':[], 'releases':0, 'sizesGiB':[]}
            item=grouped[key]
            label=classification(row.get('title',''))
            if label not in item['qualities']:item['qualities'].append(label)
            item['releases']+=1
            if row.get('size'): item['sizesGiB'].append(round(row['size']/1073741824,2))
            item['published']=max(item['published'],row.get('publishDate',''))
        result=sorted(grouped.values(),key=lambda x:x['published'],reverse=True)[:40]
        for item in result:
            item['qualities'].sort(key=lambda q: {'4K':0,'1080p':1,'720p':2,'SD':3,'Outro':4}.get(q,5))
            item['minGiB']=min(item.pop('sizesGiB') or [0])
        CACHE={'source':'ASC','movies':result,'updatedAt':int(time.time()),
               'notice':'Releases recentes encontrados no ASC. Qualidade e disponibilidade podem mudar.'}
        EXPIRES=time.monotonic()+3600
        return CACHE
