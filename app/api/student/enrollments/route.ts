import { NextRequest, NextResponse } from 'next/server';
import { getRequestIdentity } from '@/src/lib/auth/server';
import { hasSameOrigin, readJsonObject, isValidUuid } from '@/src/lib/auth/request';
export async function GET(request:NextRequest){
 if(!hasSameOrigin(request)) return NextResponse.json({error:'Origine invalide.'},{status:403});
 const {client,profile}=await getRequestIdentity(); if(!profile) return NextResponse.json({error:'Connexion requise.'},{status:401});
 const {data,error}=await client.from('enrollments').select('id,course_id,created_at,courses(id,title,slug,description,category)').eq('user_id',profile.id).order('created_at',{ascending:false});
 if(error)return NextResponse.json({error:'Chargement impossible.'},{status:500}); return NextResponse.json({enrollments:data??[]});
}
export async function POST(request:NextRequest){
 if(!hasSameOrigin(request))return NextResponse.json({error:'Origine invalide.'},{status:403});
 const {client,profile}=await getRequestIdentity(); if(!profile||profile.role!=='STUDENT')return NextResponse.json({error:'Réservé aux étudiants.'},{status:403});
 const body=await readJsonObject(request); if(!body||!isValidUuid(body.course_id))return NextResponse.json({error:'Cours invalide.'},{status:400});
 const {error}=await client.from('enrollments').insert({user_id:profile.id,course_id:body.course_id});
 if(error&&error.code!=='23505')return NextResponse.json({error:'Inscription impossible.'},{status:400}); return NextResponse.json({ok:true},{status:201});
}
