#!/usr/bin/env python3
"""Research-only, stdlib BM25 corpus. Reads published sibling files; never fetches or executes source content."""
import argparse
from html.parser import HTMLParser
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import re
import sys
import unicodedata
from urllib.parse import urlparse

CONTEXT = Path(__file__).resolve().parents[1]
KNOWLEDGE = CONTEXT.parent

def digest(data):
    return hashlib.sha256(data if isinstance(data, bytes) else data.encode('utf-8')).hexdigest()

def read_json(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))

def save(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

def now():
    return datetime.now(timezone.utc).isoformat()

def first(row, *keys, default=None):
    for key in keys:
        if key in row and row[key] is not None:
            return row[key]
    return default

def safe_path(root, base, reference):
    if not isinstance(reference, str) or not reference:
        raise ValueError('Missing local file reference')
    path = (base / reference).resolve()
    if not path.is_relative_to(root.resolve()):
        raise ValueError('Path is outside public knowledge root')
    if not path.is_file():
        raise ValueError(f'Local source file is missing: {reference}')
    return path

def normalise(row, kind):
    """Explicit supported aliases; unknown manifest shapes fail rather than guessing fields."""
    return {
        'sourceID': first(row, 'sourceID', 'id', 'sourceId'),
        'url': first(row, 'url', 'officialSourceURL', 'officialUrl'),
        'title': first(row, 'title', 'name', default='Untitled official source'),
        'authority': first(row, 'publisher', 'authority'),
        'language': first(row, 'language', default='unknown'),
        'capturedAt': first(row, 'retrievedAt', 'capturedAt'),
        'publicationDate': row.get('publicationDate') if 'publicationDate' in row else row.get('date'),
        'effectiveDate': first(row, 'effectiveDate'),
        'issuedDate': row.get('date'),
        'effectiveDateDetails': row.get('effectiveDateDetails'),
        'authorityRole': row.get('authorityRole'),
        'reuseConditions': row.get('reuseConditions'),
        'applicabilityQuestions': row.get('applicabilityQuestions', []),
        'documentKind': row.get('kind', 'service_information'),
        'legalStatus': first(row, 'legalstatus', 'legalStatus', 'status', default='unknown'),
        'amendmentStatus': first(row, 'amendmentStatus', default='unknown'),
        'currentness': first(row, 'currentness', 'reviewState', default='unverified'),
        'reviewBy': first(row, 'recheckBy', 'reviewBy'),
        'scope': first(row, 'scope', default='unresolved'),
        'rawPath': first(row, 'rawPath'),
        'textPath': first(row, 'articletextpath', 'textPath', 'extractedPath'),
        'rawSha256': first(row, 'sha256', 'rawSha256'),
        'textSha256': first(row, 'extractedSha256', 'textSha256'),
        'locators': first(row, 'locators', 'evidence', default=[]),
        'conflicts': first(row, 'conflicts', default=[]),
        'kind': 'legal_public' if kind == 'legal' and row.get('kind') not in ('service_guide', 'service_page', 'service_catalogue') else 'official_service_public',
        'manifestKind': kind,
        'ragEligible': row.get('ragEligible', True),
        'accessStatus': row.get('status', 'unknown'),
        'textKind': row.get('textKind', 'unspecified'),
        'reviewState': row.get('reviewState', 'unreviewed'),
    }

def load_manifest(path, kind):
    data = read_json(path)
    if isinstance(data, list):
        return data
    if isinstance(data, dict) and isinstance(data.get('sources'), list):
        return data['sources']
    raise ValueError('Unsupported manifest: expected array or object with sources[]')

class LinkCollector(HTMLParser):
    def __init__(self):
        super().__init__(); self.links = []
    def handle_starttag(self, tag, attrs):
        if tag == 'a':
            href = dict(attrs).get('href')
            if href: self.links.append(href)

def linked_host_exception(root, url):
    config = root / 'context/host-exceptions.json'
    for record in read_json(config).get('exceptions', []) if config.exists() else []:
        if record.get('sourceURL') != url:
            continue
        host = urlparse(record.get('officialDiscoveryURL', '')).hostname or ''
        if not host.endswith('.gov.kw'):
            continue
        original = safe_path(root, root, record['discoveryPath'])
        if digest(original.read_bytes()) != record['discoverySha256']:
            raise ValueError('Official linking-page hash mismatch')
        links = LinkCollector(); links.feed(original.read_text(encoding='utf-8'))
        if url in links.links:
            return record
    raise ValueError('Host not in official .gov.kw allowlist or pinned official-link exception')


PAGE = re.compile(r'^\s*(?:#{1,6}\s*)?(?:[-=]+\s*)?(?:PDF\s+)?(?:page|صفحة|الصفحة)\s*[:#\-]?\s*(\d+)', re.I)
ARTICLE = re.compile(r'^\s*(?:#{1,6}\s*)?\(?(?:المادة|مادة|article)\s*[:(（\-]?\s*((?:[0-9٠-٩]+|الأولى|الاولى|الثانية|الثالثة|أولى|اولى|ثانية|ثالثة)(?:\s*مكرر(?:اً|ا)?)?)', re.I)
SERVICE = re.compile(r'^\s*#{1,6}\s+(.+)$')

def segments(text):
    """Exact line spans, retaining source page/article headers; long units get labelled continuation chunks."""
    lines = text.splitlines(keepends=True)
    start = 0
    chars = 0
    locator = {'page': 1 if '\f' in text else None, 'article': None, 'service': None, 'section': None}
    for i, line in enumerate(lines):
        heading = re.sub(r'[\u202a-\u202e\u2066-\u2069]', '', line).strip()
        heading = re.sub(r'^\[PARA\s+\d+\]\s*', '', heading)
        pm, am, sm = PAGE.match(heading), ARTICLE.match(heading), SERVICE.match(heading)
        section = heading if heading in ('الشروط الواجب توافرها', 'المستندات المطلوبة', 'رسوم الخدمة', 'الوقت المستغرق', 'خطوات تنفيذ الخدمة', 'شروط الخدمة', 'المستندات', 'الخدمة', 'رسوم', 'Required Documents', 'Conditions', 'Fees') else None
        marker = heading.startswith('=====')
        article_alias = {'ONE':'1','TWO':'2','THREE':'3','FOUR':'4','أولى':'1','اولى':'1','ثانية':'2','ثالثة':'3'}
        same_article = am and article_alias.get(am.group(1),am.group(1)) == article_alias.get(locator['article'],locator['article'])
        boundary = pm or (am and not same_article) or sm or section or marker
        if i > start and (boundary or chars > 3500 and not line.strip()):
            yield start + 1, i, ''.join(lines[start:i]), dict(locator)
            start, chars = i, 0
        if pm:
            locator['page'] = int(pm.group(1))
            locator['article'] = None
            marker_article = re.search(r'\bARTICLE\s+(\d+|ONE|TWO|THREE|FOUR)', heading, re.I)
            if marker_article:
                locator['article'] = marker_article.group(1)
        if am:
            locator['article'] = am.group(1)
        if sm and not pm and not am:
            locator['service'] = sm.group(1)
        if section:
            locator['section'] = section
        chars += len(line)
        if '\f' in line:
            yield start + 1, i + 1, ''.join(lines[start:i + 1]), dict(locator)
            start, chars = i + 1, 0
            locator['page'] = (locator['page'] or 0) + 1
        elif chars > 6000:
            yield start + 1, i + 1, ''.join(lines[start:i + 1]), dict(locator)
            start, chars = i + 1, 0
    if start < len(lines):
        yield start + 1, len(lines), ''.join(lines[start:]), dict(locator)

def build(root=KNOWLEDGE, output=None, manifests=None):
    root = Path(root).resolve()
    output = Path(output or root / 'context/generated')
    manifests = manifests or [('legal', root / 'legal/index.json'), ('actions', root / 'actions/sources/index.json')]
    chunks, sources, exclusions, pending, receipts, manifest_notes = [], [], [], [], [], []
    seen = set()
    for kind, manifest in manifests:
        manifest = Path(manifest)
        if not manifest.exists():
            pending.append({'kind': kind, 'path': str(manifest), 'reason': 'Not published; no input invented'})
            continue
        if not manifest.resolve().is_relative_to(root):
            raise ValueError('Manifest outside knowledge root')
        try:
            rows = load_manifest(manifest, kind)
            manifest_data = read_json(manifest)
            manifest_conflicts = manifest_data.get('conflicts', []) if isinstance(manifest_data, dict) else []
            if isinstance(manifest_data, dict):
                manifest_notes.append({'manifest':str(manifest.relative_to(root)), 'conflicts':manifest_conflicts, 'coverageGaps':manifest_data.get('coverageGaps', []), 'requirementCandidates':manifest_data.get('requirementCandidates', []), 'authority':'collector_authored_review_metadata_not_official_source_text'})
        except (ValueError, OSError) as error:
            exclusions.append({'manifest': str(manifest), 'reason': str(error)})
            continue
        receipts.append({'kind': kind, 'path': str(manifest.relative_to(root)), 'sha256': digest(manifest.read_bytes())})
        # Legal paths are relative to legal/. Action paths are relative to actions/ by contract.
        base = root / ('legal' if kind == 'legal' else 'actions')
        for row in rows:
            source = normalise(row, kind) if isinstance(row, dict) else {}
            sid = source.get('sourceID')
            source['conflicts'] = list(source.get('conflicts') or []) + [conflict for conflict in manifest_conflicts if sid in conflict.get('sources', [])]
            try:
                if source.get('ragEligible') is not True:
                    raise ValueError('Source owner marked ragEligible=false; preserved but not indexed')
                if source.get('textKind') in ('derived_summary', 'authored_summary'):
                    raise ValueError('Authored summary is not official source text')
                if not isinstance(sid, str) or not sid or sid in seen:
                    raise ValueError('Missing or duplicate source ID')
                seen.add(sid)
                if not isinstance(source['url'], str) or not re.match(r'^https?://[^\s]+$', source['url']):
                    raise ValueError('Missing public HTTP(S) source URL')
                hostname = (urlparse(source['url']).hostname or '').lower()
                if not (hostname == 'gov.kw' or hostname.endswith('.gov.kw')):
                    source['officialLinkEvidence'] = linked_host_exception(root, source['url'])
                if not source['authority'] or not source['capturedAt']:
                    raise ValueError('Missing publisher or capture time')
                datetime.fromisoformat(source['capturedAt'].replace('Z', '+00:00'))
                raw = safe_path(root, base, source['rawPath'])
                extracted = safe_path(root, base, source['textPath'])
                raw_hash, text_hash = digest(raw.read_bytes()), digest(extracted.read_bytes())
                if raw_hash != source['rawSha256'] or text_hash != source['textSha256']:
                    raise ValueError('Original or extracted SHA-256 does not match manifest')
                text = extracted.read_text(encoding='utf-8')
                if not text.strip():
                    raise ValueError('Empty extract')
                # Failed access captures must not become evidence merely because they have hashes.
                status = json.dumps([source['legalStatus'], source['currentness'], source['accessStatus']], ensure_ascii=False).lower()
                if any(word in status for word in ['captcha', 'access_blocked', 'access_denied', 'fetch_failed', 'access_failed']):
                    raise ValueError('Access failure evidence is excluded from substantive retrieval')
                source['rawPath'], source['textPath'] = str(raw.relative_to(root)), str(extracted.relative_to(root))
                source['manifestPath'] = str(manifest.relative_to(root))
                sources.append(source)
                for a, b, content, loc in segments(text):
                    substantive = re.sub(r'^(?:SOURCE .*|=====.*)$', '', content, flags=re.M).strip()
                    if not substantive:
                        continue
                    paragraphs = re.findall(r'\[PARA\s+(\d+)\]', content)
                    loc['paragraphStart'] = int(paragraphs[0]) if paragraphs else None
                    loc['paragraphEnd'] = int(paragraphs[-1]) if paragraphs else None
                    if source['kind'] == 'official_service_public' and not loc['service']:
                        loc['service'] = source['title']
                    chunk_hash = digest(content)
                    chunk_id = f'{sid}:L{a}-{b}:{chunk_hash[:12]}'
                    # Page can be null; do not invent a PDF page from a line index.
                    chunks.append({'chunkID': chunk_id, 'sourceID': sid, 'title': source['title'], 'text': content, 'chunkSha256': chunk_hash,
                                   'locator': {**loc, 'lineStart': a, 'lineEnd': b, 'textPath': source['textPath']},
                                   'citation': {'sourceID': sid, 'chunkID': chunk_id, 'url': source['url'], 'authority': source['authority'],
                                                'rawPath': source['rawPath'], 'rawSha256': raw_hash, 'textSha256': text_hash,
                                                'capturedAt': source['capturedAt'], 'publicationDate': source['publicationDate'],
                                                'effectiveDate': source['effectiveDate'], 'status': source['legalStatus']},
                                   'kind': source['kind']})
            except (KeyError, ValueError, TypeError, OSError) as error:
                exclusions.append({'sourceID': sid, 'manifest': str(manifest.relative_to(root)), 'reason': str(error)})
    # Carry review conflicts across duplicate captures of the same official document.
    for source in sources:
        related = [other for other in sources if other['url'] == source['url'] or other['rawSha256'] == source['rawSha256']]
        combined = {}
        for other in related:
            for conflict in other['conflicts']:
                combined[json.dumps(conflict,sort_keys=True)] = conflict
        source['conflicts'] = list(combined.values())
    source_map = {source['sourceID']: source for source in sources}
    for chunk in chunks:
        source = source_map[chunk['sourceID']]
        chunk['review'] = {key:source[key] for key in ['legalStatus','reviewState','amendmentStatus','scope','conflicts','authorityRole','documentKind','issuedDate','effectiveDateDetails','reuseConditions','applicabilityQuestions']}
    result = {'schemaVersion': 1, 'builtAt': now(), 'method': 'BM25 with weighted Arabic/English query aliases and exact-phrase boost',
              'researchOnly': True, 'readinessActivated': False, 'coverageComplete': False,
              'sourceCount': len(sources), 'chunkCount': len(chunks), 'sources': sources, 'chunks': chunks,
              'manifests': receipts, 'manifestNotes':manifest_notes, 'pending': pending, 'exclusions': exclusions}
    save(output / 'corpus.json', result)
    save(output / 'build-report.json', {k: v for k, v in result.items() if k not in ('sources', 'chunks')})
    return result

def normalise_text(text):
    text = unicodedata.normalize('NFKC', text).lower()
    text = re.sub(r'[\u064b-\u065f\u0670\u0640]', '', text)
    return text.translate(str.maketrans('أإآى', 'اااي'))

def tokens(text):
    return re.findall(r'[^\W_]+', normalise_text(text), re.UNICODE)

def query_tokens(query, aliases=None):
    terms = set(tokens(query))
    normal = ' ' + normalise_text(query) + ' '
    for group in (aliases or {}).get('groups', []):
        if any(' ' + normalise_text(alias) + ' ' in normal for alias in group):
            terms.update(tokens(' '.join(group)))
    return terms

def review_flags(source, as_of):
    flags = ['RESEARCH_ONLY_NO_READINESS', 'CASE_APPLICABILITY_NOT_EVALUATED']
    if not source.get('publicationDate'):
        flags.append('PUBLICATION_DATE_UNKNOWN')
    if not source.get('effectiveDate'):
        flags.append('EFFECTIVE_DATE_UNKNOWN')
    status = json.dumps([source.get('legalStatus'), source.get('currentness'), source.get('amendmentStatus')], ensure_ascii=False).lower()
    # Only an explicit status of this source can mark the whole source superseded.
    # An amendment note may instead say that this source repeals a different instrument.
    if str(source.get('legalStatus', '')).lower() in ('repealed', 'superseded', 'withdrawn'):
        flags.append('SUPERSEDED_OR_WITHDRAWN')
    if source.get('conflicts') or 'conflict' in status:
        flags.append('SOURCE_CONFLICT')
    review_by = source.get('reviewBy')
    if review_by:
        try:
            if datetime.fromisoformat(review_by.replace('Z', '+00:00')).date() < as_of.date():
                flags.append('STALE_REVIEW')
        except ValueError:
            flags.append('INVALID_REVIEW_DATE')
    else:
        flags.append('REVIEW_DEADLINE_UNESTABLISHED')
    # Explicit fields only: prose claiming 'current' is not a legal activation signal.
    if source.get('currentness') != 'reviewed_current_for_scope':
        flags.append('CURRENTNESS_NOT_VERIFIED')
    if source.get('scope') in (None, '', 'unresolved', 'unknown'):
        flags.append('APPLICABILITY_UNRESOLVED')
    return flags

def resolve_citation(root, chunk):
    """Verify immutable source/extract and exact line span before returning any citation."""
    root = Path(root).resolve()
    citation, loc = chunk['citation'], chunk['locator']
    raw = safe_path(root, root, citation['rawPath'])
    extract = safe_path(root, root, loc['textPath'])
    if digest(raw.read_bytes()) != citation['rawSha256'] or digest(extract.read_bytes()) != citation['textSha256']:
        raise ValueError('Citation bytes changed since build')
    lines = extract.read_text(encoding='utf-8').splitlines(keepends=True)
    passage = ''.join(lines[loc['lineStart'] - 1:loc['lineEnd']])
    if passage != chunk['text'] or digest(passage) != chunk['chunkSha256']:
        raise ValueError('Citation passage does not resolve')
    return {**citation, **loc, 'localCitation': f"{loc['textPath']}#L{loc['lineStart']}-L{loc['lineEnd']}", 'resolved': True}

def retrieve(corpus, query, root=KNOWLEDGE, limit=5, mode='research', as_of=None, aliases=None):
    as_of = as_of or datetime.now(timezone.utc)
    terms = query_tokens(query, aliases)
    original_terms = set(tokens(query))
    query_phrase = normalise_text(query).strip()
    chunks = corpus['chunks']
    bags = [Counter(tokens(c['title'] + '\n' + c['text'])) for c in chunks]
    mean = sum(sum(b.values()) for b in bags) / max(len(bags), 1)
    df = Counter(t for b in bags for t in b)
    source_map = {s['sourceID']: s for s in corpus['sources']}
    matches, excluded = [], []
    for chunk, bag in zip(chunks, bags):
        n = sum(bag.values())
        score = 0.0
        for t in terms:
            freq = bag[t]
            if freq:
                idf = math.log(1 + (len(chunks) - df[t] + .5) / (df[t] + .5))
                weight = 1.0 if t in original_terms else 0.25
                score += weight * idf * freq * 2.5 / (freq + 1.5 * (.25 + .75 * n / max(mean, 1)))
        if score <= 0:
            continue
        if len(original_terms) >= 2 and query_phrase in normalise_text(chunk['title'] + '\n' + chunk['text']):
            score += 5.0
        source = source_map[chunk['sourceID']]
        flags = review_flags(source, as_of)
        if 'SUPERSEDED_OR_WITHDRAWN' in flags or mode == 'current' and any(f in flags for f in ['SOURCE_CONFLICT', 'STALE_REVIEW', 'INVALID_REVIEW_DATE', 'CURRENTNESS_NOT_VERIFIED', 'REVIEW_DEADLINE_UNESTABLISHED', 'APPLICABILITY_UNRESOLVED']):
            excluded.append({'sourceID': source['sourceID'], 'flags': flags})
            continue
        try:
            citation = resolve_citation(root, chunk)
        except (OSError, ValueError) as error:
            excluded.append({'sourceID': source['sourceID'], 'flags': ['CITATION_UNRESOLVED'], 'reason': str(error)})
            continue
        matches.append({'score': round(score, 6), 'sourceID': chunk['sourceID'], 'chunkID': chunk['chunkID'], 'passage': chunk['text'],
                        'citation': citation, 'flags': flags, 'scope': source['scope'], 'currentness': source['currentness'],
                        'amendmentStatus': source['amendmentStatus'], 'sourceLocators': source['locators'], 'review': chunk.get('review', {}), 'conflicts': source['conflicts']})
    matches.sort(key=lambda h: (-h['score'], h['chunkID']))
    flags = sorted({f for h in matches for f in h['flags']})
    conflicts = {json.dumps(conflict,sort_keys=True):conflict for hit in matches[:limit] for conflict in hit.get('conflicts', [])}
    return {'query': query, 'method': corpus['method'], 'mode': mode, 'resultStatus': 'passages_found' if matches else 'insufficient_evidence',
            'answerGenerated': False, 'licensingReady': False, 'actionAuthorised': False, 'hits': matches[:limit],
            'flagsAcrossMatchingEvidence': flags, 'conflictNotices':list(conflicts.values()), 'excluded': excluded,
            'notice': 'Quoted source evidence only. Case context supplies founder facts; neither facts nor sources grant action permission.'}

def authorise(action, authorisation, source_text=None):
    # source_text intentionally ignored: it cannot confer authority.
    if action in authorisation.get('deniedActions', []) or action not in authorisation.get('allowedActions', []):
        return {'allowed': False, 'reason': 'OUTSIDE_RESEARCH_AUTHORISATION', 'action': action}
    if authorisation.get('scope') != 'research_and_local_preparation_only' or authorisation.get('grants'):
        return {'allowed': False, 'reason': 'UNSUPPORTED_AUTHORISATION_SCOPE', 'action': action}
    return {'allowed': True, 'reason': 'USER_AUTHORISED_LOCAL_RESEARCH', 'action': action}

def validate_case(case):
    errors = []
    if case.get('synthetic') is not True:
        errors.append('This research example validator expects synthetic data')
    facts = case['privateFounderContext']['facts']
    seen = set()
    for fact in facts:
        if fact['field'] in seen:
            errors.append('Duplicate field: ' + fact['field'])
        seen.add(fact['field'])
        if fact['state'] == 'unknown' and any(fact[k] is not None for k in ['value', 'confirmedBy', 'confirmedAt']):
            errors.append('Unknown fact has a value or confirmation: ' + fact['field'])
        if fact['state'] == 'confirmed' and not (fact['confirmedBy'] and fact['confirmedAt']):
            errors.append('Confirmed fact lacks actor/time: ' + fact['field'])
    for required in ['owner.type', 'owner.nationality', 'owner.residency', 'founder.role', 'business.legalForm', 'business.activityCode', 'premises.type', 'task.stage']:
        if required not in seen:
            errors.append('Required routing field missing: ' + required)
    if case['publicKnowledge']['activationState'] != 'inactive' or case['publicKnowledge']['coverageComplete']:
        errors.append('Research cannot activate readiness')
    return errors

def route_assessment(case):
    facts = {f['field']: f for f in case['privateFounderContext']['facts']}
    fields = ['business.legalForm', 'business.activityCode', 'owner.type', 'founder.role', 'premises.type']
    unresolved = [name for name in fields if facts.get(name, {}).get('state') != 'confirmed']
    return {'route': None, 'eligibility': 'unknown', 'unresolvedFields': unresolved,
            'conditionalQuestions': 'Nationality, residency, age and employment only if a verified scoped condition makes them relevant.',
            'licensingReady': False, 'requirementSetVersion': None,
            'reason': 'Research-only source coverage and case applicability remain unresolved.'}


def adapter(case):
    """Offline candidate CaseSnapshot only. Assumptions do not become confirmed backend facts."""
    errors = validate_case(case)
    if errors:
        raise ValueError('; '.join(errors))
    facts, withheld = [], []
    for fact in case['privateFounderContext']['facts']:
        confirmed = fact['state'] == 'confirmed'
        if not confirmed and fact['value'] is not None:
            withheld.append({'field': fact['field'], 'state': fact['state'], 'reason': 'Unconfirmed values are not admitted as backend facts'})
        facts.append({k: fact[k] for k in ['field', 'origin', 'sourceRef']} | {
            'value': fact['value'] if confirmed else None,
            'confirmedBy': fact['confirmedBy'] if confirmed else None,
            'confirmedAt': fact['confirmedAt'] if confirmed else None})
    # Same canonical key ordering for these plain JSON strings/numbers as backend contracts.hash.
    canonical = json.dumps(facts, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
    return {'caseSnapshot': {'schemaVersion': 1, 'businessId': case['businessId'], 'businessRevision': case['businessRevision'], 'facts': facts,
                            'factsHash': digest(canonical), 'documentVersionIds': [], 'corrections': []},
            'withheld': withheld, 'researchOnly': True, 'runtimeApplied': False,
            'note': 'Compatible JSON shape, not a POST request. Original document IDs and job/review/handoff states require server-issued values.'}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('build')
    q = sub.add_parser('query'); q.add_argument('query'); q.add_argument('--limit', type=int, default=5); q.add_argument('--mode', choices=['research', 'current'], default='research')
    sub.add_parser('validate-case'); sub.add_parser('adapter'); sub.add_parser('verify-citations'); sub.add_parser('route')
    a = sub.add_parser('authorise'); a.add_argument('action')
    args = parser.parse_args()
    if args.command == 'build':
        result = build(); print(json.dumps({k: v for k, v in result.items() if k not in ['sources', 'chunks']}, ensure_ascii=False, indent=2))
    elif args.command == 'query':
        result = retrieve(read_json(CONTEXT / 'generated/corpus.json'), args.query, limit=args.limit, mode=args.mode, aliases=read_json(CONTEXT / 'bilingual-aliases.json'))
        print(json.dumps(result, ensure_ascii=False, indent=2))
    elif args.command == 'adapter':
        result = adapter(read_json(CONTEXT / 'madar-case.json')); save(CONTEXT / 'generated/backend-case-candidate.json', result); print(json.dumps(result, ensure_ascii=False, indent=2))
    elif args.command == 'validate-case':
        errors = validate_case(read_json(CONTEXT / 'madar-case.json')); print(json.dumps({'valid': not errors, 'errors': errors})); sys.exit(bool(errors))
    elif args.command == 'verify-citations':
        result = read_json(CONTEXT / 'generated/corpus.json')
        for chunk in result['chunks']:
            resolve_citation(KNOWLEDGE, chunk)
        print(json.dumps({'resolved': len(result['chunks']), 'sourceCount': result['sourceCount']}))
    elif args.command == 'route':
        print(json.dumps(route_assessment(read_json(CONTEXT / 'madar-case.json')), ensure_ascii=False, indent=2))
    elif args.command == 'authorise':
        print(json.dumps(authorise(args.action, read_json(CONTEXT / 'madar-authorisation.json'))))

if __name__ == '__main__':
    main()
