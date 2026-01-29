
import React from 'react';
import { api, setToken } from '../lib/api';

export default function Login(){
  const [phone, setPhone] = React.useState('+27000000021');
  const [password, setPassword] = React.useState('StrongPass123!');
  const [status, setStatus] = React.useState('');

  async function submit(){
    try {
      const { data } = await api.post('/api/auth/login', { phone, password });
      setToken(data.access);
      setStatus('Logged in');
      window.location.href = '/driver';
    } catch {
      setStatus('Login failed');
    }
  }

  return (
    <main style={{padding:20,maxWidth:420}}>
      <h1>Login</h1>
      <p style={{fontSize:12,color:'#666'}}>Use driver phone +27000000021 for driver flow demo.</p>
      <label>Phone<br/>
        <input value={phone} onChange={e=>setPhone(e.target.value)} style={{width:'100%',padding:8}} />
      </label>
      <label style={{display:'block',marginTop:12}}>Password<br/>
        <input type='password' value={password} onChange={e=>setPassword(e.target.value)} style={{width:'100%',padding:8}} />
      </label>
      <button onClick={submit} style={{marginTop:12}}>Login</button>
      {status && <p style={{marginTop:10}}>{status}</p>}
    </main>
  );
}
