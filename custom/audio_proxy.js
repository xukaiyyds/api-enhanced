// custom/audio_proxy.js
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');

// 白名单：只允许代理这些域名，防止被当跳板
const ALLOWED_HOSTS = [
  /\.music\.126\.net$/,
  /\.126\.net$/,
  /\.netease\.com$/,
];

module.exports = async (query, request) => {
  const target = query.url;

  if (!target) {
    return {
      status: 400,
      body: { code: 400, msg: '缺少 url 参数' },
    };
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(target);
  } catch {
    return {
      status: 400,
      body: { code: 400, msg: '无效的 url' },
    };
  }

  // 检查域名是否在白名单内
  if (!ALLOWED_HOSTS.some((re) => re.test(parsedUrl.hostname))) {
    return {
      status: 403,
      body: { code: 403, msg: '禁止访问该域名' },
    };
  }

  try {
    // 关键：转发 Referer，否则网易云会 403
    const upstream = await fetch(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        Referer: 'https://music.163.com/',
        // 把浏览器的 Range 头转发过去，这样才能拖动进度条、边下边播
        ...(query.range ? { Range: query.range } : {}),
      },
    });

    // 使用 pipeline 流式转发，不占内存
    // 注意：这里需要将 Node.js 的响应流写回，在 NeteaseCloudMusicApi 的架构中，
    // 通常需要通过 request 库返回流，但为了简化，这里返回一个特殊的标记
    // 让外部路由处理流式响应。
    // 具体实现见第二步。
    return {
      status: upstream.status,
      // 将 upstream 的 body 和 headers 传递给外部处理
      _stream: {
        body: Readable.fromWeb(upstream.body),
        headers: {
          'content-type': upstream.headers.get('content-type'),
          'content-length': upstream.headers.get('content-length'),
          'content-range': upstream.headers.get('content-range'),
          'accept-ranges': upstream.headers.get('accept-ranges') || 'bytes',
        },
      },
    };
  } catch (e) {
    console.error('[音频代理] 请求上游失败:', e);
    return {
      status: 502,
      body: { code: 502, msg: '上游服务器错误' },
    };
  }
};