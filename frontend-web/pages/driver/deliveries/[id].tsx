
import React from 'react';
import { api } from '../../../lib/api';

export default function DriverDelivery(){
  const [delivery, setDelivery] = React.useState<any>(null);
  const [tracking, setTracking] = React.useState<any[]>([]);
  const [status, setStatus] = React.useState('picked_up');
  const [podNote, setPodNote] = React.useState('Delivered to customer');

  const id = React.useMemo(()=>{
    if (typeof window === 'undefined') return '';
    return window.location.pathname.split('/').pop() || '';
  },[]);

  async function load(){
    const { data } = await api.get(`/api/deliveries/${id}`);
    setDelivery(data.delivery);
    setTracking(data.tracking||[]);
  }

  React.useEffect(()=>{ if(id) load(); },[id]);

  async function updateStatus(){
    await api.put(`/api/deliveries/${id}/status`, { status });
    await load();
  }

  async function submitPOD(){
    await api.post(`/api/deliveries/${id}/pod`, { proof_json: { note: podNote, ts: new Date().toISOString() } });
    await load();
  }

  return (
    <main style={{padding:20}}>
      <h1>Delivery {id}</h1>
      {delivery && (
        <>
          <p><strong>Status:</strong> {delivery.status}</p>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            <select value={status} onChange={e=>setStatus(e.target.value)}>
              <option value='assigned'>assigned</option>
              <option value='picked_up'>picked_up</option>
              <option value='en_route'>en_route</option>
              <option value='arrived'>arrived</option>
              <option value='delivered'>delivered</option>
              <option value='failed'>failed</option>
            </select>
            <button onClick={updateStatus}>Update Status</button>
          </div>

          <section style={{marginTop:16}}>
            <h3>Proof of Delivery</h3>
            <textarea value={podNote} onChange={e=>setPodNote(e.target.value)} style={{width:'100%',height:80}} />
            <button onClick={submitPOD} style={{marginTop:8}}>Submit PoD</button>
          </section>

          <section style={{marginTop:16}}>
            <h3>Tracking</h3>
            <ul>
              {tracking.map((t:any)=> (
                <li key={t.id || t.ts}>{t.ts} — {t.status} — {t.note}</li>
              ))}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}
