import CustomerForm from './customer-form';
export const metadata={title:'Project information',robots:{index:false,follow:false},referrer:'no-referrer' as const};
export default async function Page({params}:{params:Promise<{token:string}>}){return <CustomerForm token={(await params).token}/>;}
