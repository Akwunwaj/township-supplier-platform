
import React from 'react';
import { api } from '../../lib/api';

export default function DriverHome(){
  const [items, setItems] = React.useState<any[]>([]);

  async function load(){
    try {
      const { data } = await api.get('/api/driver/deliveries');
      setItems(data.items||[]);
    } catch {
      setItems([]);
    }
  }

  React.useEffect(()=>{ load(); },[]);

  return (
    <main style={{padding:20}}>
      <h1>Driver Manifest</h1>
      <button onClick={load}>Refresh</button>
      <ul style={{marginTop:12}}>
        {items.map((d:any)=> (
          <li key={d.id} style={{marginBottom:10}}>
            <strong>Delivery:</strong> {d.id} — <strong>Status:</strong> {d.status}
            <div><a href={`/driver/deliveries/${d.id}`}>Open</a></div>
          </li>
        ))}
      </ul>
      {!items.length && <p style={{color:'#666'}}>No assigned deliveries yet. Ask admin to assign.</p>}
    </main>
  );
}
