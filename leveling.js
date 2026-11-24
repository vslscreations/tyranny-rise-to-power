/* Read-only XP presentation. All thresholds, totals and levels come from Supabase. */
window.TyrannyLeveling = (() => {
  let citizenId=null, generation=0, request=null, progress=null, status='idle';
  const node=id=>document.getElementById(id);
  const integer=value=>{
    if(typeof value!=='string'||!/^\d+$/.test(value))throw Error('Invalid XP value');
    return BigInt(value);
  };
  function normalize(data,id) {
    if(data?.citizen_id!==id||!Number.isInteger(data.level)||data.level<1)throw Error('Invalid citizen level');
    const total=integer(data.total_xp),into=integer(data.xp_into_level);
    if(into>total)throw Error('Invalid XP progress');
    const next=data.next_level===null?null:data.next_level;
    let needed=null,remaining=null;
    if(next!==null){
      if(next!==data.level+1)throw Error('Invalid next level');
      needed=integer(data.xp_for_next_level);remaining=integer(data.xp_remaining);
      if(needed<=0n||into>=needed||remaining!==needed-into)throw Error('Invalid XP threshold');
    }
    const percent=Number(data.progress_percent);
    if(!Number.isFinite(percent)||percent<0||percent>100)throw Error('Invalid progress percentage');
    return {level:data.level,total,into,next,needed,remaining,percent:next===null?0:percent};
  }
  function render() {
    const level=node('playerLevel'),total=node('playerXpTotal'),bar=node('playerXpProgress'),hint=node('playerXpHint');
    if(!level||!total||!bar||!hint)return;
    let description;
    if(progress){
      level.textContent=`Level ${progress.level}`;
      total.textContent=`${progress.total.toLocaleString()} XP`;
      bar.value=progress.percent;
      hint.textContent=progress.next===null?'Next level coming soon':`${progress.into.toLocaleString()} / ${progress.needed.toLocaleString()} XP to Level ${progress.next}`;
      description=`Level ${progress.level}, ${progress.total.toLocaleString()} total XP. ${progress.next===null?'Next level is not configured yet.':`${progress.remaining.toLocaleString()} XP remaining to Level ${progress.next}.`}`;
    }else{
      level.textContent='Level —';bar.value=0;
      total.textContent=status==='loading'?'Loading XP…':status==='error'?'XP unavailable':'— XP';
      hint.textContent=status==='error'?'Progress could not be loaded.':'Your citizen progression';
      description=status==='error'?'XP progress unavailable.':'XP progress loading.';
    }
    bar.setAttribute('aria-valuetext',description);
    node('profileWidget')?.setAttribute('aria-label',`Open MyLife profile. ${description}`);
  }
  function reset() {
    generation++;citizenId=null;request=null;progress=null;status='idle';render();
  }
  function refresh() {
    if(!citizenId)return Promise.resolve();
    if(request)return request;
    const epoch=generation,id=citizenId;
    status='loading';render();
    request=(async()=>{
      await Promise.resolve();
      if(epoch!==generation)return;
      try {
        const {data,error}=await getAuthClient().rpc('get_my_level_progress');
        if(epoch!==generation)return;
        if(error)throw error;
        progress=normalize(data,id);status='ready';
      }catch(error){
        if(epoch!==generation)return;
        progress=null;status='error';
      }finally{
        if(epoch===generation){request=null;render();}
      }
    })();
    return request;
  }
  function start(id) {
    if(!id){reset();return Promise.resolve();}
    if(citizenId===id&&(progress||request))return request||Promise.resolve();
    if(citizenId!==id){reset();citizenId=id;}
    return refresh();
  }
  return {start,refresh,reset};
})();
