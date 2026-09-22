import { randomUUID } from 'node:crypto';
import { verifyPiUser, apiError } from '../lib/pi.js';
import { safeRecordMetric } from '../lib/metrics.js';
import { rememberUser, claimPendingIous, getUserByUsername, saveIou } from '../lib/store.js';

const same=(a,b)=>String(a||'').toLowerCase()===String(b||'').toLowerCase();
const roundPi=value=>Math.round(Number(value)*1e7)/1e7;
export default async function handler(req,res){
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({success:false,error:'Method not allowed'})}
  try{
    const user=await verifyPiUser(req);await rememberUser(user);await claimPendingIous(user);
    const title=String(req.body?.title||'Shared expense').trim();const dueDate=String(req.body?.dueDate||'').trim()||null;const rows=Array.isArray(req.body?.participants)?req.body.participants:[];
    if(!title||title.length>100)return res.status(400).json({success:false,error:'Title must be between 1 and 100 characters'});
    if(rows.length<2||rows.length>12)return res.status(400).json({success:false,error:'A split needs between 2 and 12 participants'});
    if(dueDate&&Number.isNaN(new Date(`${dueDate}T00:00:00Z`).getTime()))return res.status(400).json({success:false,error:'Invalid due date'});
    const seen=new Set(),participants=[];
    for(const row of rows){const username=String(row?.username||'').trim().replace(/^@/,'');const amount=roundPi(row?.amount);const key=username.toLowerCase();if(!/^[A-Za-z0-9_-]{3,32}$/.test(username)||same(username,user.username))return res.status(400).json({success:false,error:'Check every Pi username'});if(seen.has(key))return res.status(400).json({success:false,error:`@${username} appears more than once`});if(!Number.isFinite(amount)||amount<=0||amount>100000)return res.status(400).json({success:false,error:`Enter a valid amount for @${username}`});seen.add(key);participants.push({username,amount,known:await getUserByUsername(username)})}
    const groupId=randomUUID(),now=new Date().toISOString(),total=roundPi(participants.reduce((n,p)=>n+p.amount,0));
    const ious=participants.map(p=>{const id=randomUUID(),counterparty=p.known?.username||p.username;return{id,creatorUid:user.uid,creatorUsername:user.username,counterpartyUid:p.known?.uid||null,counterpartyUsername:counterparty,debtorUsername:counterparty,creditorUsername:user.username,amount:p.amount,note:title,dueDate,status:'proposed',recurrence:{frequency:'none',seriesId:id,cycle:1},installmentPlan:null,split:{groupId,title,total,participantCount:participants.length},reminders:[],createdAt:now,updatedAt:now,history:[{type:'created',by:user.username,at:now},{type:'split_share_created',by:user.username,at:now,groupId,total,participantCount:participants.length}]}});
    await Promise.all(ious.map(saveIou));await safeRecordMetric(user.uid,'split_created',groupId);await Promise.all(ious.map(i=>safeRecordMetric(user.uid,'iou_created',i.id)));
    return res.status(201).json({success:true,split:{groupId,title,total,participantCount:ious.length},ious:ious.map(i=>({id:i.id,counterpartyUsername:i.counterpartyUsername,amount:i.amount}))});
  }catch(error){return apiError(res,error)}
}
