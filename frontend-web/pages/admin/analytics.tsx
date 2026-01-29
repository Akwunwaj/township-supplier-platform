
import React from 'react';
import { api } from '../../lib/api';

export default function AdminAnalytics(){
  const [gmv, setGmv] = React.useState<any[]>([]);
  React.useEffect(()=>{ (async()=>{ const g = await api.get('/api/analytics/gmv/daily?days=30'); setGmv(g.data.series||[]); })(); },[]);
  return (
    <main style={{padding:20}}>
      <h1>Analytics</h1>
      <table><thead><tr><th>Date</th><th>GMV</th></tr></thead><tbody>
        {gmv.map((r:any)=> (<tr key={r.d}><td>{r.d}</td><td>{Number(r.total||0).toFixed(2)}</td></tr>))}
      </tbody></table>
    </main>
  );
}
