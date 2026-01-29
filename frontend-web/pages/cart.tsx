
import React from 'react';
import { api } from '../lib/api';

export default function Cart(){
  const [cart, setCart] = React.useState<any>({ items: [] });
  React.useEffect(()=>{ (async()=>{ try{ const { data } = await api.get('/api/cart'); setCart(data); }catch(e){} })(); },[]);
  return (
    <main style={{padding:20}}>
      <h1>Cart</h1>
      <ul>
        {cart.items?.map((it:any)=> (
          <li key={it.id || it.product_id}>{it.product_id} x {it.quantity} @ ZAR {it.unit_price}</li>
        ))}
      </ul>
      <a href='/checkout'>Go to Checkout</a>
    </main>
  );
}
