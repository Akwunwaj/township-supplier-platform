
import type { AppProps } from 'next/app';
import React from 'react';
import { getToken, clearToken } from '../lib/api';

function Nav(){
  return (
    <nav style={{display:'flex',gap:12,padding:10,borderBottom:'1px solid #ddd',alignItems:'center'}}>
      <a href='/'>Home</a>
      <a href='/login'>Login</a>
      <a href='/cart'>Cart</a>
      <a href='/checkout'>Checkout</a>
      <a href='/driver'>Driver</a>
      <a href='/admin'>Admin</a>
      <a href='/admin/analytics'>Analytics</a>
      <a href='/settings/notifications'>Notifications</a>
      <span style={{marginLeft:'auto',fontSize:12,color:'#555'}}>{getToken() ? 'Authenticated' : 'Guest'}</span>
      {getToken() ? <button onClick={()=>{clearToken(); location.href='/login';}} style={{marginLeft:8}}>Logout</button> : null}
    </nav>
  );
}

export default function MyApp({ Component, pageProps }: AppProps){
  return (<><Nav /><Component {...pageProps} /></>);
}
