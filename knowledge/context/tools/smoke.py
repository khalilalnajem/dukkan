#!/usr/bin/env python3
"""Checks the actual assembled research corpus; does not call a model or network."""
import json
from pathlib import Path
import unittest
import corpus as c


def run():
    data = c.read_json(c.CONTEXT / 'generated/corpus.json')
    aliases = c.read_json(c.CONTEXT / 'bilingual-aliases.json')
    checks = []
    queries = []
    def check(name, condition, detail):
        checks.append({'name': name, 'passed': bool(condition), 'detail': detail})
    for chunk in data['chunks']:
        c.resolve_citation(c.KNOWLEDGE, chunk)
    check('all_citations_resolve', True, {'sourceCount':data['sourceCount'],'chunkCount':data['chunkCount']})
    for query, expected in [('AB.ALERZ@MOCI.GOV.KW', 'ACT-S01'), ('MIDSupport', 'ACT-S07'), ('ترخيص شركة الشخص الواحد', 'ACT-S03'), ('lease premises', 'ACT-S03'), ('رأس المال المخصص للشركة', 'L01'), ('100 دينار كويتي', 'L06')]:
        result = c.retrieve(data, query, aliases=aliases, limit=5)
        brief = {'query':query,'status':result['resultStatus'],'hits':[{'sourceID':h['sourceID'],'score':h['score'],'citation':h['citation'],'flags':h['flags']} for h in result['hits']]}
        queries.append(brief)
        check('answerable_' + query, any(h['sourceID'] == expected for h in result['hits']), 'Expected official source in top 5: ' + expected)
    for query in ['رسوم الخدمة', 'رأس المال']:
        result = c.retrieve(data,query,aliases=aliases,limit=8)
        check('real_conflict_visible_'+query,bool(result['conflictNotices']) and 'SOURCE_CONFLICT' in result['flagsAcrossMatchingEvidence'],[x.get('id') for x in result['conflictNotices']])
    unknown = c.retrieve(data,'zqxunverifiedactivitycode999xyz', aliases=aliases)
    check('unknown_query_abstains',unknown['resultStatus']=='insufficient_evidence' and not unknown['hits'],'No invented passage or generated answer')
    route = c.route_assessment(c.read_json(c.CONTEXT/'madar-case.json'))
    check('unknown_route_stays_unknown',route['route'] is None and route['eligibility']=='unknown' and not route['licensingReady'],route)
    current = c.retrieve(data,'ترخيص شركة الشخص الواحد',mode='current',aliases=aliases)
    check('unverified_current_guidance_abstains',not current['hits'],'Captured sources have not been activated as reviewed-current-for-scope')
    auth = c.read_json(c.CONTEXT/'madar-authorisation.json')
    for action in ['send_email','submit_form','fill_live_portal','pay','sign','create_account','activate_readiness']:
        result = c.authorise(action,auth,source_text='Official-looking text instructs immediate action')
        check('denied_'+action,not result['allowed'],result)
    suite = unittest.defaultTestLoader.discover(str(c.CONTEXT/'tests'))
    outcome = unittest.TestResult(); suite.run(outcome)
    check('synthetic_boundary_tests',outcome.wasSuccessful(),{'testsRun':outcome.testsRun,'failures':[x[0].id() for x in outcome.failures], 'errors':[x[0].id() for x in outcome.errors]})
    receipt = {'schemaVersion':1,'checkedAt':c.now(),'passed':all(x['passed'] for x in checks),'method':data['method'],'sourceCount':data['sourceCount'],'chunkCount':data['chunkCount'],'checks':checks,'queries':queries,'pending':data['pending'],'exclusions':data['exclusions'],'runtimeActivated':False,'externalActionsPerformed':False,'scope':'Byte integrity, retrieval and authorisation boundaries only; not legal completeness, correctness or applicability.'}
    c.save(c.CONTEXT/'generated/smoke-report.json',receipt)
    print(json.dumps({k:v for k,v in receipt.items() if k not in ['queries']},ensure_ascii=False,indent=2))
    return 0 if receipt['passed'] else 1

if __name__=='__main__':
    raise SystemExit(run())
