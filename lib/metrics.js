import crypto from 'node:crypto';
import { recordMetric } from './store.js';
const EVENTS=new Set(['login','iou_created','iou_action','iou_settled','support_payment','recurrence_created','installment_plan','recurring_cycle_generated','reminder_sent','partial_confirmed']);
const day=()=>new Date().toISOString().slice(0,10);
function pseudonym(value){const secret=(process.env.IIOU_METRICS_SECRET||process.env.PI_API_KEY||'').trim();if(!secret)throw new Error('Metrics secret is not configured');return crypto.createHmac('sha256',secret).update(value).digest('hex')}
export async function safeRecordMetric(uid,event,dedupeId=''){if(!uid||!EVENTS.has(event))return false;try{const subject=pseudonym(`user:${uid}`),dedupe=dedupeId?pseudonym(`event:${uid}:${event}:${dedupeId}`):'';return await recordMetric(day(),subject,event,dedupe)}catch{return false}}
