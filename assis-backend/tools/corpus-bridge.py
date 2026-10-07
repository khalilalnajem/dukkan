"""Bounded read-only adapter around the published corpus.py; stdin/stdout JSON only."""
import hashlib
import json
from pathlib import Path
import sys
import types

class KnowledgeError(Exception):
    def __init__(self, code, message):
        self.code, self.message = code, message


def fail(code, message):
    raise KnowledgeError(code, message)


def run(request):
    root = Path(request['root']).resolve(strict=True)
    pins = json.loads(Path(__file__).with_name('knowledge-pins.json').read_text())
    cache = {}
    total = 0

    def read(ref, expected=None, maximum=20 * 1024 * 1024):
        nonlocal total
        if not isinstance(ref, str) or Path(ref).is_absolute():
            fail('KNOWLEDGE_PATH_ESCAPE', 'Invalid public knowledge reference.')
        path = (root / ref).resolve()
        if not path.is_relative_to(root):
            fail('KNOWLEDGE_PATH_ESCAPE', 'Public knowledge reference escapes its root.')
        if ref not in cache:
            try:
                with path.open('rb') as handle:
                    data = handle.read(maximum + 1)
            except OSError:
                fail('KNOWLEDGE_MISSING', 'A pinned public knowledge input is unavailable.')
            total += len(data)
            if len(data) > maximum or total > 96 * 1024 * 1024:
                fail('KNOWLEDGE_SIZE_LIMIT', 'Public knowledge inputs exceed the bounded read limit.')
            cache[ref] = data
        data = cache[ref]
        if expected and hashlib.sha256(data).hexdigest() != expected:
            fail('KNOWLEDGE_HASH_MISMATCH', 'Public knowledge bytes changed; a reviewed snapshot update is required.')
        return data

    def pinned(ref):
        return read(ref, pins[ref], 4 * 1024 * 1024)

    corpus = json.loads(pinned('context/generated/corpus.json'))
    if (corpus.get('schemaVersion') != 1 or corpus.get('researchOnly') is not True
            or corpus.get('readinessActivated') is not False or corpus.get('coverageComplete') is not False
            or not isinstance(corpus.get('sources'), list) or not 0 < len(corpus['sources']) <= 64
            or not isinstance(corpus.get('chunks'), list) or not 0 < len(corpus['chunks']) <= 512):
        fail('CORPUS_MALFORMED', 'Published corpus schema or inactive-state constraints are invalid.')
    # Execute only pinned publisher tooling, never source content. No import pycache writes.
    module = types.ModuleType('dikan_published_corpus')
    module.__file__ = str(root / 'context/tools/corpus.py')
    exec(compile(pinned('context/tools/corpus.py'), module.__file__, 'exec'), module.__dict__)
    aliases = json.loads(pinned('context/bilingual-aliases.json'))
    for receipt in corpus['manifests']:
        read(receipt['path'], receipt['sha256'], 4 * 1024 * 1024)
    sources = {s['sourceID']: s for s in corpus['sources']}
    if len(sources) != len(corpus['sources']):
        fail('CORPUS_MALFORMED', 'Duplicate corpus source identifier.')
    for source in sources.values():
        read(source['rawPath'], source['rawSha256'])
        read(source['textPath'], source['textSha256'], 4 * 1024 * 1024)
    resolved = {}
    for chunk in corpus['chunks']:
        citation, loc = chunk['citation'], chunk['locator']
        source = sources[chunk['sourceID']]
        for ck, sk in [('sourceID','sourceID'), ('url','url'), ('authority','authority'), ('rawPath','rawPath'), ('rawSha256','rawSha256'), ('textSha256','textSha256'), ('capturedAt','capturedAt'), ('publicationDate','publicationDate'), ('effectiveDate','effectiveDate'), ('status','legalStatus')]:
            if citation[ck] != source[sk]:
                fail('CITATION_INVALID', 'Citation inputs do not match their pinned source record.')
        if loc['textPath'] != source['textPath'] or citation['chunkID'] != chunk['chunkID']:
            fail('CITATION_INVALID', 'Citation identity or extract path does not match.')
        lines = read(loc['textPath']).decode('utf8').splitlines(keepends=True)
        start, end = loc['lineStart'], loc['lineEnd']
        if type(start) is not int or type(end) is not int or not 1 <= start <= end <= len(lines):
            fail('CITATION_INVALID', 'Citation line range is invalid.')
        passage = ''.join(lines[start-1:end])
        if passage != chunk['text'] or hashlib.sha256(passage.encode()).hexdigest() != chunk['chunkSha256']:
            fail('CITATION_INVALID', 'Citation passage does not resolve to the captured extract.')
        resolved[chunk['chunkID']] = {**citation, **loc, 'localCitation': f"{loc['textPath']}#L{start}-L{end}", 'resolved': True}
    module.resolve_citation = lambda _root, chunk: resolved[chunk['chunkID']]
    # Question scaffolding must not retrieve unrelated passages on common English/Arabic words.
    original_query_tokens = module.query_tokens
    stopwords = set(module.tokens('a an the is are was were what which how can could would should i me my we our you your to of for in on and or please about do does tell explain want know this that with it هل ما ماذا كيف اين من في عن الى علي اريد ممكن لي هو هي هذا هذه ان او و'))
    module.query_tokens = lambda query, aliases=None: original_query_tokens(query, aliases) - stopwords
    result = module.retrieve(corpus, request['query'], root=root, limit=512, mode=request['mode'], aliases=aliases)
    # Confirmed context only breaks relevance ties; it cannot create a match for an unrelated question.
    context_query = request.get('contextQuery', '')
    if context_query and result['hits']:
        contextual = module.retrieve(corpus, context_query, root=root, limit=512, mode=request['mode'], aliases=aliases)
        scores = {h['chunkID']: h['score'] for h in contextual['hits']}
        maximum = max(scores.values(), default=1)
        weight = max(h['score'] for h in result['hits']) * .1
        for hit in result['hits']:
            hit['contextBoost'] = round(weight * scores.get(hit['chunkID'], 0) / maximum, 6)
        result['hits'].sort(key=lambda h: (-h['score']-h['contextBoost'], h['chunkID']))
    result['hits'] = result['hits'][:request['limit']]
    result['conflictNotices'] = list({json.dumps(c, sort_keys=True): c for h in result['hits'] for c in h['conflicts']}.values())
    result['corpusSha256'] = pins['context/generated/corpus.json']
    result['builtAt'] = corpus['builtAt']
    # Only selected source metadata travels back; full source text remains local.
    result['sourceRecords'] = [sources[sid] for sid in dict.fromkeys(hit['sourceID'] for hit in result['hits'])]
    if request.get('application'):
        refs = ['actions/forms/madar-preparation-worksheet.json', 'actions/forms/observed-forms.json', 'context/progressive-questions.json']
        documents = [json.loads(pinned(ref)) for ref in refs]
        worksheet, forms, questions = documents
        if worksheet.get('canSubmit') is not False or worksheet.get('officialApplicationFieldsObserved') is not False:
            fail('APPLICATION_TEMPLATE_INVALID', 'Worksheet must remain local preparation only.')
        if not any(f.get('id') == 'ACT-F02' and f.get('fields') == [] and f.get('status') == 'blocked_not_observed' for f in forms['forms']):
            fail('APPLICATION_TEMPLATE_INVALID', 'Official licence form observation boundary changed.')
        result['applicationData'] = {'worksheet': worksheet, 'forms': forms, 'questions': questions, 'provenance': [{'path': ref, 'sha256': pins[ref], 'authority': 'Dikan-authored preparation structure or observation metadata; not an official application'} for ref in refs]}
    if request.get('action'):
        kind = request['action']
        if kind not in ('route-clarification', 'missing-document'):
            fail('INVALID_ENQUIRY_KIND', 'Unknown enquiry kind.')
        action_id = 'ACT-A01' if kind == 'route-clarification' else 'ACT-A02'
        refs = ['actions/manifest.json', 'actions/sha256-index.json', 'actions/contacts.json', f'actions/templates/{kind}.json', f'actions/playbooks/{action_id}.json']
        authored = {ref: json.loads(pinned(ref)) for ref in refs}
        contact = next(c for c in authored['actions/contacts.json']['contacts'] if c['id'] == 'ACT-C02')
        # Contact citation is exact captured evidence, independently from the authored contact registry.
        contact_chunks = [c for c in corpus['chunks'] if c['sourceID'] == contact['evidence']['sourceId'] and contact['destination'].lower() in c['text'].lower()]
        if not contact_chunks:
            fail('CONTACT_CITATION_UNRESOLVED', 'Published contact destination has no resolving official passage.')
        evidence = contact_chunks[0]
        if contact['officialSourceURL'] != evidence['citation']['url']:
            fail('CONTACT_CITATION_UNRESOLVED', 'Contact URL differs from its source evidence.')
        result['actionData'] = {'contact': contact, 'contactPassage': evidence['text'], 'contactCitation': resolved[evidence['chunkID']], 'contactPassageHash': evidence['chunkSha256'], 'template': authored[f'actions/templates/{kind}.json'], 'playbook': authored[f'actions/playbooks/{action_id}.json'], 'provenance': [{'path': ref, 'sha256': pins[ref], 'authority': 'Dikan-authored procedure, not official text'} for ref in refs]}
    return result

try:
    request_text = sys.stdin.buffer.read(32769)
    if len(request_text) > 32768:
        fail('KNOWLEDGE_REQUEST_LIMIT', 'Knowledge request exceeds the bounded input limit.')
    print(json.dumps({'ok': True, 'data': run(json.loads(request_text))}, ensure_ascii=False))
except KnowledgeError as error:
    print(json.dumps({'ok': False, 'error': {'code': error.code, 'message': error.message}}))
except (ValueError, KeyError, TypeError, UnicodeError, StopIteration):
    print(json.dumps({'ok': False, 'error': {'code': 'CORPUS_MALFORMED', 'message': 'Public knowledge data is malformed; no fallback evidence was used.'}}))
except OSError:
    print(json.dumps({'ok': False, 'error': {'code': 'KNOWLEDGE_MISSING', 'message': 'Public knowledge input is unavailable; no fallback evidence was used.'}}))
