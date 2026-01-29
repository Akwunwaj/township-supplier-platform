
import React from 'react';
import { api } from '../../lib/api';

export default function Admin(){
  const [users, setUsers] = React.useState<any[]>([]);
  const [deliveryId, setDeliveryId] = React.useState('');
  const [driverId, setDriverId] = React.useState('');

  async function loadUsers(){
    const { data } = await api.get('/api/admin/users');
    setUsers(data||[]);
  }

  async function assign(){
    await api.put(`/api/admin/deliveries/${deliveryId}/assign`, { driver_id: driverId });
    alert('Assigned');
  }

  React.useEffect(()=>{ loadUsers(); },[]);

  return (
    <main style={{padding:20}}>
      <h1>Admin</h1>
      <h2>Users</h2>
      <ul>
        {users.map(u=> (<li key={u.id}>{u.role}: {u.phone} ({u.id})</li>))}
      </ul>

      <h2 style={{marginTop:18}}>Assign Delivery to Driver</h2>
      <input placeholder='Delivery ID' value={deliveryId} onChange={e=>setDeliveryId(e.target.value)} style={{width:'100%',maxWidth:520}} />
      <input placeholder='Driver User ID (UUID)' value={driverId} onChange={e=>setDriverId(e.target.value)} style={{width:'100%',maxWidth:520,marginTop:8}} />
      <button onClick={assign} style={{marginTop:8}}>Assign</button>
      <p style={{fontSize:12,color:'#666'}}>Tip: Delivery IDs are created automatically after successful payment ITN.</p>
    </main>
  );
}
