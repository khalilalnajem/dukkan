#!/usr/bin/env python3
"""Reproducible numeric normalisation; does not infer missing values or mix sources."""
import json
from pathlib import Path
import re
from library import ROOT, sha, save

def generate(root=ROOT):
    source=root/'text/csb-population-2025.txt'
    rows=[]
    for line_no,line in enumerate(source.read_text().splitlines(),1):
        match=re.match(r'^\s*(less than 1 year|\d+-\d+|80\+|Total)\s+((?:[\d,]+\s+){8}[\d,]+)',line)
        if not match:continue
        label=match.group(1);v=[int(x.replace(',','')) for x in match.group(2).split()]
        assert len(v)==9 and v[0]==v[1]+v[2] and v[3]==v[4]+v[5] and v[6]==v[7]+v[8]
        assert v[0]==v[3]+v[6] and v[1]==v[4]+v[7] and v[2]==v[5]+v[8]
        age='all ages' if label=='Total' else 'under 1' if label=='less than 1 year' else label
        if '-' in age:age='–'.join(str(x) for x in sorted(map(int,age.split('-'))))
        rows.append({'ageGroup':age,'rawAgeLabel':label,'allResidents':{'total':v[0],'female':v[1],'male':v[2]},'nonKuwaiti':{'total':v[3],'female':v[4],'male':v[5]},'kuwaiti':{'total':v[6],'female':v[7],'male':v[8]},'unit':'persons','observationDate':'2025-01-01','geography':'Kuwait','sourceID':'MK-CSB-POP-2025','pdfPage':1,'extractLine':line_no})
    assert len(rows)==19 and rows[-1]['allResidents']['total']==4881254
    for group in ('allResidents','nonKuwaiti','kuwaiti'):
        for sex in ('total','female','male'):assert sum(r[group][sex] for r in rows[:-1])==rows[-1][group][sex]
    save(root/'generated/population-table.json',{'authority':'Normalised transcription from CSB PDF; not a new independent source','sourceID':'MK-CSB-POP-2025','rawSha256':sha((root/'raw/csb-population-2025.pdf').read_bytes()),'qa':'Single PDF page visually inspected; all row, column and nationality totals reconciled','rows':rows})
    raw=json.loads((root/'raw/worldbank-kuwait.json').read_text());assert raw[0]['pages']==1 and len(raw[1])==77
    units={'SP.POP.TOTL':'persons','NY.GDP.MKTP.CD':'current USD','NY.GDP.PCAP.CD':'current USD per person','FP.CPI.TOTL.ZG':'annual percent change','IT.NET.USER.ZS':'percent of population','NE.CON.PRVT.CD':'current USD','SL.UEM.TOTL.ZS':'percent of total labour force; modelled ILO estimate'}
    observations=[]
    for r in raw[1]:
        assert r['countryiso3code']=='KWT' and r['indicator']['id'] in units
        observations.append({'indicator':r['indicator']['id'],'name':r['indicator']['value'],'year':int(r['date']),'value':r['value'],'unit':units[r['indicator']['id']],'geography':'Kuwait','missing':r['value'] is None,'sourceID':'MK-WB-INDICATORS'})
    save(root/'generated/worldbank-observations.json',{'authority':'Normalised World Bank API response, not a new independent source','sourceID':'MK-WB-INDICATORS','rawSha256':sha((root/'raw/worldbank-kuwait.json').read_bytes()),'lastUpdated':raw[0]['lastupdated'],'rows':observations})
    manifest=json.loads((root/'manifest.json').read_text())
    for s in manifest['sources']:
        filename={'MK-CSB-POP-2025':'population-table.json','MK-WB-INDICATORS':'worldbank-observations.json'}.get(s['id'])
        if filename:
            s['structuredPath']='generated/'+filename;s['structuredSha256']=sha((root/s['structuredPath']).read_bytes())
    save(root/'manifest.json',manifest)
    return {'populationRows':len(rows),'worldBankObservations':len(observations),'missingWorldBankValues':sum(r['missing'] for r in observations)}

if __name__=='__main__':print(json.dumps(generate()))
