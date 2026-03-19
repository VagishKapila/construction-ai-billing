const ORG_ID = localStorage.getItem("org_id");

function getPayAppId(){
  const p=new URLSearchParams(window.location.search);
  return p.get("id");
}

function money(v){
  return Number(v).toLocaleString("en-US",{style:"currency",currency:"USD"});
}

async function load(){

 const id=getPayAppId();

 const r=await fetch(`/api/pay-apps/${id}`,{
   headers:{"X-Org-Id":ORG_ID}
 });

 const data=await r.json();

 document.getElementById("contract").innerText=money(data.contract_sum);
 document.getElementById("due").innerText=money(data.current_due);
 document.getElementById("retain").innerText=money(data.retainage);

 const body=document.getElementById("rows");

 body.innerHTML="";

 data.items.forEach(it=>{

  const tr=document.createElement("tr");

  tr.innerHTML=`
  <td>${it.code}</td>
  <td>${it.description}</td>
  <td>${money(it.scheduled)}</td>
  <td>${money(it.prev)}</td>
  <td>${money(it.this)}</td>
  <td>${money(it.stored)}</td>
  <td>${money(it.completed)}</td>
  <td>${money(it.retainage)}</td>
  <td>${money(it.balance)}</td>
  `;

  body.appendChild(tr);

 });

}

load();
