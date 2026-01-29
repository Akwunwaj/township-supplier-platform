
import React from 'react';
import { api } from '../../lib/api';

export default function NotificationSettings(){
  const [prefs, setPrefs] = React.useState<any>({ sms_enabled:true, email_enabled:true, push_enabled:true });
  React.useEffect(()=>{ (async()=>{ const { data } = await api.get('/api/notifications/preferences'); setPrefs(data);} )(); },[]);
  async function save(){ await api.put('/api/notifications/preferences', prefs); alert('Saved'); }
  return (
    <main style={{padding:20}}>
      <h1>Notification Settings</h1>
      <label><input type='checkbox' checked={prefs.sms_enabled} onChange={e=>setPrefs({...prefs, sms_enabled:e.target.checked})}/> SMS</label>
      <button onClick={save} style={{marginLeft:12}}>Save</button>
    </main>
  );
}
