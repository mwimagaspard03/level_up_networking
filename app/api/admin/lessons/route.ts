import { NextRequest, NextResponse } from 'next/server';
import { getRequestIdentity } from '@/src/lib/auth/server';
import { hasSameOrigin, readJsonObject, isValidUuid } from '@/src/lib/auth/request';
export async function POST(request: NextRequest) {
  if(!hasSameOrigin(request)) return NextResponse.json({error:'Origine invalide.'},{status:403});
  const {client,profile}=await getRequestIdentity();
  if(!profile||!['OWNER','ADMIN'].includes(profile.role)) return NextResponse.json({error:'Accès refusé.'},{status:403});
  const body=await readJsonObject(request);
  if(!body||!isValidUuid(body.course_id)||typeof body.title!=='string'||typeof body.slug!=='string'||typeof body.content!=='string') return NextResponse.json({error:'Données invalides.'},{status:400});
  const title=body.title.trim(),slug=body.slug.trim().toLowerCase(),content=body.content.trim();
  if(!title||title.length>160||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)||slug.length>160||content.length>12000) return NextResponse.json({error:'Vérifiez les champs.'},{status:400});
  const order=Number.isInteger(body.sort_order)&&Number(body.sort_order)>=0?Number(body.sort_order):0;
  const status=body.status==='published'?'published':'draft';
  const {data,error}=await client.from('lessons').insert({course_id:body.course_id,title,slug,content,sort_order:order,status}).select('id').single();
  if(error) return NextResponse.json({error:'Création impossible. Vérifiez le cours et le slug.'},{status:400});
  return NextResponse.json({id:data.id},{status:201});
}
