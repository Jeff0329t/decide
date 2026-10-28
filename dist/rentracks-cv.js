// レントラックス（アフィリエイト）成果タグ PID16631（購入完了ページ）。
// Stripeから戻ったとき（success_url の session_id 付き）に、決済ごとに1回だけ送る。
// 成果特定の識別記号（cinfo）は Stripe の Checkout Session ID。Stripe の管理画面で購入と照合できる。
(function(){
var sessionId = new URLSearchParams(location.search).get('session_id') || '';
if(!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return;
var sentKey = 'decide.rentracks.cv.' + sessionId;
try { if(localStorage.getItem(sentKey)) return; localStorage.setItem(sentKey, '1'); } catch(error) {}
function loadScriptRTCV(callback){
var script = document.createElement('script');
script.type = 'text/javascript';
script.src = 'https://www.rentracks.jp/js/itp/rt.track.js?t=' + (new Date()).getTime();
if ( script.readyState ) {
script.onreadystatechange = function() {
if ( script.readyState === 'loaded' || script.readyState === 'complete' ) {
script.onreadystatechange = null;
callback();
};
};
} else {
script.onload = function() {
callback();
};
};
document.getElementsByTagName('head')[0].appendChild(script);
}

loadScriptRTCV(function(){
_rt.sid = 11675;
_rt.pid = 16631;
_rt.price = 0;
_rt.reward = -1;
_rt.cname = '';
_rt.ctel = '';
_rt.cemail = '';
_rt.cinfo = encodeURIComponent(sessionId);
rt_tracktag();
});
}());
