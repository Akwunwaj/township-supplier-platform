
import React, { useEffect, useState } from 'react';
import { SafeAreaView, Text, TextInput, Button, View, ScrollView, TouchableOpacity } from 'react-native';

type Delivery = { id: string; status: string; };

export default function App(){
  const [apiBase, setApiBase] = useState('https://your-ngrok-domain');
  const [phone, setPhone] = useState('+27000000021');
  const [password, setPassword] = useState('StrongPass123!');
  const [token, setToken] = useState<string>('');
  const [screen, setScreen] = useState<'login'|'manifest'|'detail'>('login');
  const [manifest, setManifest] = useState<Delivery[]>([]);
  const [deliveryId, setDeliveryId] = useState<string>('');
  const [detail, setDetail] = useState<any>(null);
  const [podNote, setPodNote] = useState('Delivered to customer');
  const [status, setStatus] = useState('picked_up');

  async function api(path: string, method: string='GET', body?: any){
    const resp = await fetch(`${apiBase}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await resp.json().catch(()=> ({}));
    if (!resp.ok) throw new Error(data?.error || 'request_failed');
    return data;
  }

  async function login(){
    const data = await api('/api/auth/login','POST',{ phone, password });
    setToken(data.access);
    setScreen('manifest');
  }

  async function loadManifest(){
    const data = await api('/api/driver/deliveries');
    setManifest(data.items || []);
  }

  async function openDelivery(id: string){
    setDeliveryId(id);
    const data = await api(`/api/deliveries/${id}`);
    setDetail(data);
    setScreen('detail');
  }

  async function updateStatus(){
    await api(`/api/deliveries/${deliveryId}/status`, 'PUT', { status });
    await openDelivery(deliveryId);
  }

  async function submitPod(){
    await api(`/api/deliveries/${deliveryId}/pod`, 'POST', { proof_json: { note: podNote, ts: new Date().toISOString() } });
    await openDelivery(deliveryId);
  }

  useEffect(()=>{ if(screen==='manifest') loadManifest(); },[screen]);

  return (
    <SafeAreaView style={{ flex:1, padding: 16 }}>
      {screen==='login' && (
        <View>
          <Text style={{ fontSize: 24, fontWeight: '600' }}>Driver Login</Text>
          <Text style={{ marginTop: 8, color:'#666' }}>Use driver seed +27000000021</Text>
          <Text style={{ marginTop: 12 }}>API Base (ngrok)</Text>
          <TextInput value={apiBase} onChangeText={setApiBase} style={{ borderWidth: 1, padding: 8, marginTop: 6 }} />
          <Text style={{ marginTop: 12 }}>Phone</Text>
          <TextInput value={phone} onChangeText={setPhone} style={{ borderWidth: 1, padding: 8, marginTop: 6 }} />
          <Text style={{ marginTop: 12 }}>Password</Text>
          <TextInput value={password} onChangeText={setPassword} secureTextEntry style={{ borderWidth: 1, padding: 8, marginTop: 6 }} />
          <Button title="Login" onPress={()=>login().catch(()=>{})} />
        </View>
      )}

      {screen==='manifest' && (
        <View style={{flex:1}}>
          <Text style={{ fontSize: 22, fontWeight: '600' }}>My Deliveries</Text>
          <Button title="Refresh" onPress={()=>loadManifest().catch(()=>{})} />
          <ScrollView style={{ marginTop: 12 }}>
            {manifest.map(d => (
              <TouchableOpacity key={d.id} onPress={()=>openDelivery(d.id).catch(()=>{})} style={{ padding: 12, borderWidth:1, borderColor:'#ddd', borderRadius:8, marginBottom:10 }}>
                <Text>Delivery: {d.id}</Text>
                <Text>Status: {d.status}</Text>
              </TouchableOpacity>
            ))}
            {!manifest.length && <Text style={{color:'#666'}}>No deliveries assigned yet.</Text>}
          </ScrollView>
          <Button title="Logout" onPress={()=>{setToken(''); setScreen('login');}} />
        </View>
      )}

      {screen==='detail' && (
        <View style={{flex:1}}>
          <Button title="Back" onPress={()=>setScreen('manifest')} />
          <Text style={{ fontSize: 22, fontWeight: '600', marginTop: 8 }}>Delivery Detail</Text>
          <Text>ID: {deliveryId}</Text>
          <Text>Status: {detail?.delivery?.status}</Text>

          <Text style={{ marginTop: 12, fontWeight:'600' }}>Update Status</Text>
          <TextInput value={status} onChangeText={setStatus} style={{ borderWidth:1, padding:8, marginTop:6 }} />
          <Button title="Update" onPress={()=>updateStatus().catch(()=>{})} />

          <Text style={{ marginTop: 12, fontWeight:'600' }}>Proof of Delivery</Text>
          <TextInput value={podNote} onChangeText={setPodNote} style={{ borderWidth:1, padding:8, marginTop:6 }} />
          <Button title="Submit PoD" onPress={()=>submitPod().catch(()=>{})} />

          <Text style={{ marginTop: 12, fontWeight:'600' }}>Tracking</Text>
          <ScrollView style={{ marginTop: 6 }}>
            {(detail?.tracking||[]).map((t:any)=> (
              <Text key={t.id || t.ts} style={{ marginBottom: 6 }}>{t.ts} — {t.status} — {t.note}</Text>
            ))}
          </ScrollView>
        </View>
      )}

    </SafeAreaView>
  );
}
