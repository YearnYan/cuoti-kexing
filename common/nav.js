(() => {
  try {
    // 当前页面头部导航已内联实现，此脚本作为兼容占位，避免 404/MIME 报错。
    window.CuotiNavLoaded = true;
  } catch (error) {
    console.warn("nav.js 加载异常：", error);
  }
})();
