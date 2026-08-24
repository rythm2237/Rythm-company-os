import "server-only";

const API="https://api.stripe.com/v1";

export function stripeConfigured(){return Boolean(process.env.STRIPE_SECRET_KEY);}

export async function stripePost(path:string,params:URLSearchParams,idempotencyKey?:string){
 const key=process.env.STRIPE_SECRET_KEY;
 if(!key) throw new Error("Stripe billing is not configured on this deployment.");
 const response=await fetch(`${API}${path}`,{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/x-www-form-urlencoded",...(idempotencyKey?{"Idempotency-Key":idempotencyKey}:{})},body:params.toString(),cache:"no-store"});
 const data=await response.json();
 if(!response.ok) throw new Error(data?.error?.message??`Stripe request failed (${response.status}).`);
 return data;
}
