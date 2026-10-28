// レントラックス（アフィリエイト）LPタグ PID16631。
// 広告経由（_rt_ck 等のパラメータ付き）で開いたときだけ読み込む。中身は配布されたタグのまま。
// rt.track.js が _rt_ck を Cookie / localStorage（decisionprocess.net のファーストパーティ）に保存し、購入完了ページの成果タグが読む。
if(/[?&](_rt_ck|_ridx|idx)=/.test(location.search)){
(function(callback){
var script = document.createElement("script");
script.type = "text/javascript";
script.src = "https://www.rentracks.jp/js/itp/rt.track.js?t=" + (new Date()).getTime();
if ( script.readyState ) {
script.onreadystatechange = function() {
if ( script.readyState === "loaded" || script.readyState === "complete" ) {
script.onreadystatechange = null;
callback();
}
};
} else {
script.onload = function() {
callback();
};
}
document.getElementsByTagName("head")[0].appendChild(script);
}(function(){}));
}
