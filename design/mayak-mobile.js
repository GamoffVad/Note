
const mobileParams=new URLSearchParams(location.search);document.body.dataset.platform=mobileParams.get('platform')==='android'?'android':'ios';
const mobileScreen=mobileParams.get('screen')||'list';
if(mobileScreen==='list'){switchTab('notes');document.body.classList.add('list-open')}
else if(['tasks','files','devices'].includes(mobileScreen))switchTab(mobileScreen);
else if(mobileScreen==='transfer'){switchTab('files');document.querySelector('[data-action=transfer]').click()}
document.addEventListener('click',event=>{if(event.target.closest('[data-tab=notes]'))document.body.classList.add('list-open')});
