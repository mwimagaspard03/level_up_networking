import { NextRequest, NextResponse } from 'next/server';
import { getRequestIdentity } from '@/src/lib/auth/server';
import { hasSameOrigin, readJsonObject, isValidUuid } from '@/src/lib/auth/request';
export async function GET(request:NextRequest){
 if(!hasSameOrigin(request))return NextResponse.json({error:'Origine invalide.'},{status:403});
 const {client,profile}=await getRequestIdentity(); if(!profile)return NextResponse.json({error:'Connexion requise.'},{status:401});
 const {data,error}=await client.from('lesson_progress').select('lesson_id,completed_at').eq('user_id',profile.id);
 if(error)return NextResponse.json({error:'Chargement impossible.'},{status:500}); return NextResponse.json({progress:data??[]});
}
export async function POST(request:NextRequest){
 if(!hasSameOrigin(request))return NextResponse.json({error:'Origine invalide.'},{status:403});
 const {client,profile}=await getRequestIdentity(); if(!profile||profile.role!=='STUDENT')return NextResponse.json({error:'Réservé aux étudiants.'},{status:403});
 const body=await readJsonObject(request); if(!body||!isValidUuid(body.lesson_id)||typeof body.completed!=='boolean')return NextResponse.json({error:'Données invalides.'},{status:400});
 if(body.completed){const {error}=await client.from('lesson_progress').upsert({user_id:profile.id,lesson_id:body.lesson_id,completed_at:new Date().toISOString()},{onConflict:'user_id,lesson_id'});if(error)return NextResponse.json({error:'Progression non enregistrée.'},{status:400});}
 else {const {error}=await client.from('lesson_progress').update({completed_at:null}).eq('user_id',profile.id).eq('lesson_id',body.lesson_id);if(error)return NextResponse.json({error:'Progression non mise à jour.'},{status:400});}
 return NextResponse.json({ok:true});
}
