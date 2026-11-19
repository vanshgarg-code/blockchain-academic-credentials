import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

const API = import.meta.env.VITE_API_BASE || '/api';
const demo = { name: 'Aarav Sharma', degree: 'B.Tech', branch: 'Computer Science', cgpa: '8.7', graduationYear: '2026' };
const short = (value, count = 13) => value && value.length > count * 2 ? value.slice(0, count) + '…' + value.slice(-7) : (value || '—');
const labels = { name: 'Student name', degree: 'Degree', branch: 'Branch', cgpa: 'CGPA', graduationYear: 'Graduation year' };

async function request(path, body, key) {
  let response;
  try {
    response = await fetch(API + path, body === undefined ? {} : {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(key && { 'x-admin-key': key }) },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('Cannot reach the credential API. Check that it is running.');
  }
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw new Error(data?.error || 'The credential service did not return a usable response.');
  return data;
}

function download(name, data) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function FileInput({ label, onRead }) {
  return <label>{label}<input type="file" accept=".json,application/json" onChange={async event => {
    const file = event.target.files[0];
    event.target.value = '';
    if (file) await onRead(file);
  }} /></label>;
}

function useOperation() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function run(operation) {
    setBusy(true);
    setError('');
    try { await operation(); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return { busy, error, run };
}

function Notice({ operation }) {
  return <>{operation.error && <p className="error" role="alert">{operation.error}</p>}
    {operation.busy && <p role="status">Working…</p>}</>;
}

function Details({ data, label = 'Technical details' }) {
  return <details><summary>{label}</summary><pre>{JSON.stringify(data, null, 2)}</pre></details>;
}

function University({ onHandoff }) {
  const [key, setKey] = useState('');
  const [fields, setFields] = useState(demo);
  const [attempt, setAttempt] = useState(null);
  const [issued, setIssued] = useState(null);
  const [id, setId] = useState('');
  const [revoked, setRevoked] = useState(null);
  const issue = useOperation();
  const revoke = useOperation();

  function startIssue(event) {
    event.preventDefault();
    const requestId = attempt || '0x' + Array.from(crypto.getRandomValues(new Uint8Array(32)),
      byte => byte.toString(16).padStart(2, '0')).join('');
    setAttempt(requestId);
    setIssued(null);
    issue.run(async () => {
      const receipt = await request('/issue', { fields, requestId }, key);
      setIssued(receipt);
      setId(receipt.id);
      setAttempt(null);
    });
  }

  return <>
    <label>Administrator key<input type="password" autoComplete="off" value={key} onChange={e => setKey(e.target.value)} /></label>
    <div className="columns">
      <form className="card" onSubmit={startIssue}>
        <div className="card-title-row"><span className="step-number">01</span><h2>Issue a credential</h2></div>
        <p>Commit the academic fields to the local blockchain.</p>
        <fieldset disabled={issue.busy || !!attempt}>
          {Object.entries(fields).map(([name, value]) => <label key={name}>{labels[name]}<input required maxLength={500}
            value={value} onChange={e => setFields({ ...fields, [name]: e.target.value })} /></label>)}
        </fieldset>
        <button disabled={issue.busy || !key}>{attempt ? 'Retry issuance' : 'Issue credential'}</button>
        {attempt && !issue.busy && <button type="button" className="secondary" onClick={() => setAttempt(null)}>Discard retry</button>}
        <Notice operation={issue} />
        {issued && <section className="outcome" role="status">
          <h3>Credential issued</h3>
          <code>{issued.id}</code>
          <p>Give the private access file to the student. It contains the token needed to disclose fields.</p>
          <button type="button" onClick={() => download('student-access-secret.json', { credentialId: issued.id, studentToken: issued.studentToken })}>Save private access file</button>
          <button type="button" className="secondary" onClick={() => onHandoff({ id: issued.id, studentToken: issued.studentToken })}>Open student view</button>
          <Details label="Issuance receipt" data={{ id: issued.id, root: issued.root, txHash: issued.txHash }} />
        </section>}
      </form>
      <form className="card" onSubmit={event => {
        event.preventDefault();
        if (!window.confirm('Revoke this credential? All of its proofs will fail verification.\n\n' + id.trim())) return;
        setRevoked(null);
        revoke.run(async () => setRevoked(await request('/revoke', { id: id.trim() }, key)));
      }}>
        <div className="card-title-row"><span className="step-number">04</span><h2>Revoke a credential</h2></div>
        <p>Revocation is permanent and must come from the original issuing wallet. The blockchain records this status change.</p>
        <label>Credential ID<input required value={id} onChange={e => setId(e.target.value)} /></label>
        <button className="danger" disabled={revoke.busy || !key || !id.trim()}>Revoke credential</button>
        <Notice operation={revoke} />
        {revoked && <section className="outcome"><h3>Credential revoked</h3><Details data={revoked} /></section>}
      </form>
    </div>
  </>;
}

function Student({ access, setAccess, onVerify }) {
  const [fields, setFields] = useState([]);
  const [selected, setSelected] = useState([]);
  const [proof, setProof] = useState(null);
  const operation = useOperation();

  function reset(next) {
    setAccess(next);
    setFields([]);
    setSelected([]);
    setProof(null);
  }

  function loadFields(next = access) {
    return operation.run(async () => {
      const response = await request('/fields', { id: next.id.trim(), studentToken: next.studentToken.trim() });
      setFields(response.fields);
    });
  }

  return <section className="card">
    <div className="card-title-row"><span className="step-number">02</span><h2>Share academic fields</h2></div>
    <p>Load your private access file, then choose only the claims the verifier needs. Undisclosed fields remain off-chain.</p><div className="explainer"><strong>Privacy note</strong> · A Merkle proof confirms the disclosed values match the on-chain commitment. It is not a zero-knowledge proof.</div>
    <fieldset disabled={operation.busy}>
      <FileInput label="Import private access file" onRead={file => operation.run(async () => {
        const parsed = JSON.parse(await file.text());
        if (typeof parsed?.credentialId !== 'string' || typeof parsed?.studentToken !== 'string') throw new Error('Choose a student access JSON file.');
        const next = { id: parsed.credentialId, studentToken: parsed.studentToken };
        reset(next);
        const response = await request('/fields', next);
        setFields(response.fields);
      })} />
      <label>Credential ID<input value={access.id} onChange={e => reset({ ...access, id: e.target.value })} /></label>
      <label>Student token<input type="password" autoComplete="off" value={access.studentToken} onChange={e => reset({ ...access, studentToken: e.target.value })} /></label>
      <button disabled={!access.id.trim() || !access.studentToken.trim()} onClick={() => loadFields()}>Load fields</button>
      {fields.length > 0 && <div className="choices">
        {fields.map(field => <label key={field}><input type="checkbox" checked={selected.includes(field)} onChange={e => {
          setProof(null);
          setSelected(e.target.checked ? [...selected, field] : selected.filter(item => item !== field));
        }} />{labels[field] || field}</label>)}
        <button disabled={!selected.length} onClick={() => operation.run(async () => {
          setProof(null);
          setProof(await request('/disclose', { id: access.id.trim(), studentToken: access.studentToken.trim(), fields: selected }));
        })}>Generate proof</button>
      </div>}
    </fieldset>
    <Notice operation={operation} />
    {proof && <section className="outcome">
      <h3>Disclosure ready</h3>
      <p>Share the proof file with your verifier. It contains the selected values.</p>
      <button onClick={() => download('selective-disclosure.json', proof)}>Download proof</button>
      <button className="secondary" onClick={() => onVerify(JSON.stringify(proof, null, 2))}>Open verifier view</button>
    </section>}
  </section>;
}

function Verifier({ proof, setProof }) {
  const [result, setResult] = useState(null);
  const operation = useOperation();
  return <section className="card">
    <div className="card-title-row"><span className="step-number">03</span><h2>Verify a disclosure</h2></div>
    <p>Check the disclosed claims against the Solidity contract. The verifier never needs the student's private access token.</p>
    <fieldset disabled={operation.busy}>
      <FileInput label="Import proof file" onRead={file => operation.run(async () => {
        if (file.size > 128 * 1024) throw new Error('Proof file is too large.');
        setProof(await file.text());
        setResult(null);
      })} />
      <label>Or paste proof JSON<textarea rows="8" value={proof} onChange={e => { setProof(e.target.value); setResult(null); }} /></label>
      <button disabled={!proof.trim()} onClick={() => operation.run(async () => {
        setResult(null);
        let parsed;
        try { parsed = JSON.parse(proof); } catch { throw new Error('The proof file contains invalid JSON.'); }
        setResult(await request('/verify', parsed));
      })}>Verify proof</button>
    </fieldset>
    <Notice operation={operation} />
    {result && <section className={result.valid ? 'outcome' : 'outcome rejected'} role="status">
      <h3>{result.valid ? 'Valid' : result.status === 'REVOKED' ? 'Revoked' : result.status === 'NONE' ? 'Credential missing' : 'Invalid proof'}</h3>
      <p>{result.reason}</p><div className="explainer"><strong>Checked at block {result.blockNumber ?? '—'}</strong> · Current status: {result.status} · Issuer: {short(result.issuer)}</div>
      {result.claims?.map(({ field, value }, index) => <p key={index}><strong>{labels[field] || field}</strong> · {value}</p>)}
      <Details data={result} />
    </section>}
  </section>;
}

function History() {
  const [id, setId] = useState('');
  const [record, setRecord] = useState(null);
  const [history, setHistory] = useState(null);
  const inspect = useOperation();
  const load = useOperation();
  return <div className="columns">
    <form className="card" onSubmit={event => {
      event.preventDefault();
      setRecord(null);
      inspect.run(async () => setRecord(await request('/credential/' + encodeURIComponent(id.trim()))));
    }}>
      <h2>Inspect on-chain record</h2>
      <label>Credential ID<input required value={id} onChange={e => setId(e.target.value)} /></label>
      <button disabled={inspect.busy}>Inspect record</button><Notice operation={inspect} />
      {record && <section className="outcome"><h3>{record.status === 'NONE' ? 'Credential missing' : record.status}</h3><Details data={record} /></section>}
    </form>
    <section className="card">
      <h2>Blockchain activity</h2>
      <p>Real Solidity events from the local chain. The API returns up to 25 events from the latest 1,000 blocks.</p>
      <button disabled={load.busy} onClick={() => load.run(async () => setHistory(await request('/history')))}>Load activity</button>
      <Notice operation={load} />
      {history && <div className="result-grid" aria-label="Activity summary">
        <div className="stat"><strong>{history.events.length}</strong><span>Events loaded</span></div>
        <div className="stat"><strong>{history.events.filter(e => e.action === 'Issued').length}</strong><span>Issued</span></div>
        <div className="stat"><strong>{history.events.filter(e => e.action === 'Revoked').length}</strong><span>Revoked</span></div>
      </div>}
      {history?.events.length === 0 && <p>No recent credential events in the scanned window.</p>}
      {history?.events && <div className="events">{history.events.map(event => <article className="event" key={event.txHash + event.id}>
        <div className="event-top"><span className={'event-tag' + (event.action === 'Revoked' ? ' revoked' : '')}>{event.action}</span><span className="event-meta">Block #{event.blockNumber}</span></div>
        <div className="event-code" title={event.id}>Credential {short(event.id, 16)}</div>
        <div className="event-code" title={event.txHash}>Transaction {short(event.txHash, 16)}</div>
        <button className="event-link" type="button" onClick={() => navigator.clipboard?.writeText(event.txHash)}>Copy transaction hash</button>
        <Details label="View event details" data={event} />
      </article>)}</div>}
    </section>
  </div>;
}

function App() {
  const [tab, setTab] = useState('University');
  const [health, setHealth] = useState(null);
  const [access, setAccess] = useState({ id: '', studentToken: '' });
  const [proof, setProof] = useState('');
  const [verifierKey, setVerifierKey] = useState(0);
  const [studentKey, setStudentKey] = useState(0);
  const healthOperation = useOperation();

  function checkHealth() {
    healthOperation.run(async () => {
      setHealth(null);
      setHealth(await request('/config'));
    });
  }
  useEffect(checkHealth, []);

  return <div className="shell">
    <header><div className="eyebrow">CSD436 · BLOCKCHAIN TECHNOLOGY · STUDENT PROJECT</div><h1>Academic credentials, verified on-chain.</h1>
      <p>From university issuance to student-controlled disclosure and independent verification. Built with Solidity, SHA-256 Merkle proofs and a local Ethereum-compatible chain.</p>
      <div className="hero-tags"><span>Solidity smart contract</span><span>Selective disclosure</span><span>Revocation-aware</span></div></header>
    <section className="health" aria-label="Deployment status">
      <div><strong>{health ? 'Connected · Hardhat chain ' + health.chainId : 'Checking deployment'}</strong>
        {health && <div><code>{health.contract}</code></div>}<Notice operation={healthOperation} /></div>
      <button className="secondary" disabled={healthOperation.busy} onClick={checkHealth}>Check connection</button>
    </section>
    <nav aria-label="Credential workflows">{['University', 'Student', 'Verifier', 'Activity'].map(item =>
      <button key={item} aria-current={tab === item ? 'page' : undefined} onClick={() => setTab(item)}>{item}</button>)}</nav>
    <main>
      <div hidden={tab !== 'University'}><div className="explainer"><strong>University workflow</strong> · Issue a credential and save its student access file. Only the salted Merkle root, issuer, status, timestamp and version are recorded on-chain.</div><University onHandoff={next => { setAccess(next); setStudentKey(key => key + 1); setTab('Student'); }} /></div>
      <div hidden={tab !== 'Student'}><Student key={studentKey} access={access} setAccess={setAccess} onVerify={value => { setProof(value); setVerifierKey(key => key + 1); setTab('Verifier'); }} /></div>
      <div hidden={tab !== 'Verifier'}><Verifier key={verifierKey} proof={proof} setProof={setProof} /></div>
      <div hidden={tab !== 'Activity'}><div className="explainer"><strong>Blockchain auditability</strong> · Events below are emitted by the Solidity contract. They reveal credential identifiers and transaction metadata, never private transcript values.</div><History /></div>
    </main>
    <footer>Academic prototype · Local Hardhat blockchain · No real student records · PoW/concurrency experiments are separate simulations</footer>
  </div>;
}

createRoot(document.getElementById('root')).render(<App />);
