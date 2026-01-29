
import React from 'react';
import { api } from '../lib/api';

export default function Checkout(){
  const [supplier_id, setSupplier] = React.useState('');
  const [addr, setAddr] = React.useState('');
  const [order, setOrder] = React.useState<any>(null);
  const [pay, setPay] = React.useState<any>(null);

  async function place(){
    const { data } = await api.post('/api/orders', { supplier_id, delivery_address: { street: addr } });
    setOrder(data);
  }
  async function initiatePayfast(){
    const { data } = await api.post('/api/payments/initiate', { order_id: order.id, method: 'payfast' });
    setPay(data);
  }

  return (
    <main style={{padding:20}}>
      <h1>Checkout</h1>
      <div style={{display:'grid',gap:8,maxWidth:420}}>
        <input placeholder='Supplier ID' value={supplier_id} onChange={e=>setSupplier(e.target.value)} />
        <input placeholder='Street address' value={addr} onChange={e=>setAddr(e.target.value)} />
        {!order && <button onClick={place}>Place Order</button>}
      </div>
      {order && (
        <section style={{marginTop:16}}>
          <div>Order #{order.id} Total ZAR {order.total_amount}</div>
          {!pay && <button onClick={initiatePayfast} style={{marginTop:8}}>Pay with PayFast</button>}
        </section>
      )}
      {pay && (
        <section style={{marginTop:16}}>
          <form action={pay.process_url} method='post'>
            {Object.entries(pay.fields).map(([k,v]: any)=> (
              <input key={k} type='hidden' name={k} value={v} />
            ))}
            <button type='submit'>Continue to PayFast</button>
          </form>
        </section>
      )}
    </main>
  );
}
