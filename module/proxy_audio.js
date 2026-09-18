// module/proxy_audio.js
const fetch = require("node-fetch");

module.exports = async (ctx, core) => {
  const { query } = ctx;
  const { url } = query;

  if (!url) {
    return { status: 400, body: { code: 400, msg: "missing url" } };
  }

  // 安全检查：只允许网易云 CDN 域名
  const allowPattern = /^https?:\/\/[\w.-]*music\.126\.net\//;
  if (!allowPattern.test(url)) {
    return { status: 403, body: { code: 403, msg: "forbidden" } };
  }

  try {
    const upstream = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Referer: "https://music.163.com/",
      },
    });

    if (!upstream.ok) {
      return { status: upstream.status, body: { code: upstream.status, msg: "upstream error" } };
    }

    // 关键：返回音频流时带上 CORS 头
    // 这里通过 core.res 直接操作 Express 响应对象
    const res = core.res;
    res.set({
      "Content-Type": upstream.headers.get("content-type") || "audio/mpeg",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=3600",
      "Accept-Ranges": "bytes",
    });

    // 流式转发
    upstream.body.pipe(res);
    
    // 注意：这里不返回对象，因为已经通过 res 直接发送了响应
    return null;
  } catch (e) {
    core.logger.error("音频代理失败:", e.message);
    return { status: 500, body: { code: 500, msg: "proxy failed" } };
  }
};
