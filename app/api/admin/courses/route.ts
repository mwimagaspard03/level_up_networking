import { NextRequest, NextResponse } from 'next/server';
import { getRequestIdentity } from '@/src/lib/auth/server';
import { hasSameOrigin, readJsonObject } from '@/src/lib/auth/request';

const categories = ['networking_fundamentals','ipv4_subnetting','ipv6','switching','routing','packet_tracer'];
export async function GET(request: NextRequest) {
  if (!hasSameOrigin(request)) return NextResponse.json({ error: 'Origine invalide.' }, { status: 403 });
  const { client, profile } = await getRequestIdentity();
  if (!profile || !['OWNER','ADMIN'].includes(profile.role)) return NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });
  const { data, error } = await client.from('courses').select('id,title,slug,description,category,status,created_at').order('created_at',{ascending:false}).limit(100);
  if (error) return NextResponse.json({error:'Chargement impossible.'},{status:500});
  return NextResponse.json({courses:data??[]});
}
export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request)) return NextResponse.json({ error: 'Origine invalide.' }, { status: 403 });
  const { client, profile } = await getRequestIdentity();
  if (!profile || !['OWNER','ADMIN'].includes(profile.role)) return NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });
  const body = await readJsonObject(request);
  if (!body || typeof body.title !== 'string' || typeof body.slug !== 'string' || typeof body.category !== 'string') return NextResponse.json({error:'Données invalides.'},{status:400});
  const title=body.title.trim(), slug=body.slug.trim().toLowerCase(), description=typeof body.description==='string'?body.description.trim():'';
  const status=body.status==='published'?'published':'draft';
  if(title.length<1||title.length>160||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)||slug.length>160||!categories.includes(body.category)) return NextResponse.json({error:'Vérifiez le titre, le slug et la catégorie.'},{status:400});
  const {data,error}=await client.from('courses').insert({title,slug,description,category:body.category,status,created_by:profile.id}).select('id').single();
  if(error) return NextResponse.json({error:error.code==='23505'?'Ce slug existe déjà.':'Création impossible.'},{status:400});
  return NextResponse.json({id:data.id},{status:201});
}
