# IPv6（DDNS）直连

[English](#ipv6-ddns-direct-access)

1. 给运行 TaroBird 的主机配置公网 IPv6。通过路由器或 DDNS 客户端，把域名的 **AAAA** 记录持续更新为主机的公网 IPv6。DNS 记录使用直接解析，例如 Cloudflare 的「仅 DNS」模式。
2. 为这个域名签发新设备信任的 HTTPS 证书。使用完整证书链和 PEM 私钥，例如通过 ACME DNS-01 签发。
3. 在当前主机状态目录的 `config.json` 中加入下方的 `ipv6Ddns` 字段，保留文件里的其他设置。可用 `tarobird status --json` 查看 `directory`。证书路径可以是绝对路径，也可以相对于该目录。
4. 等当前 Bot 任务结束后重启 TaroBird 主机服务。放行路由器和主机防火墙的对应 **IPv6 TCP 入站端口**。示例使用 8443，URL 省略端口时使用 443。
5. 在 **设置 → 网络与连接 → 添加设备** 选择 **IPv6 (DDNS)** 并扫码，核对 8 位配对码后确认。CLI 可运行 `tarobird pair --ipv6-ddns`。已配对的拥有者设备上线时可同步该线路，也可在 **连接状态与线路** 扫码更新。

```json
{
  "ipv6Ddns": {
    "url": "https://taro.example.com:8443",
    "tls": {
      "cert": "tls/fullchain.pem",
      "key": "tls/privkey.pem"
    }
  }
}
```

关闭手机 Wi-Fi 后，用支持 IPv6 的移动网络测试连接。若主机显示已监听但外网连不上，检查 AAAA 记录和两级防火墙的入站规则。IPv6 地址变化后，DDNS 更新 AAAA，客户端仍使用原域名。续签证书后重启主机以加载新证书。停用时删除 `ipv6Ddns` 字段并重启主机。

### 使用 HTTP 地址和自定义端口

Windows 和 Android 可扫描明确标记为 **IPv6 (DDNS) · HTTP** 的连接二维码。把下面的字段加入主机配置并重启，域名和端口换成自己的。HTTP 会明文传输聊天与会话数据。设备仍需配对确认，已有设备可手动扫码添加。

```json
{
  "ipv6Ddns": {
    "url": "http://taro.example.com:8443",
    "allowPlainHttp": true
  }
}
```

## IPv6 DDNS direct access

1. Give the TaroBird host a publicly routable IPv6 address. Use your router or DDNS client to keep the hostname's **AAAA** record pointed at the host. Use direct DNS resolution, such as DNS-only mode on Cloudflare.
2. Issue a certificate for the hostname that new devices trust. Provide the full certificate chain and PEM private key. ACME DNS-01 is one way to issue the certificate.
3. Add the `ipv6Ddns` object above to the active host directory's `config.json`. Keep the other properties in the file. Run `tarobird status --json` to see `directory`. Certificate paths can be absolute or relative to that directory.
4. Let active Bot tasks finish before restarting the TaroBird host service. Allow inbound **IPv6 TCP** on the configured port in both the router and host firewalls. The example uses 8443. Omitting the port uses 443.
5. Open **Settings → Network & connections → Add device**, choose **IPv6 (DDNS)**, scan the QR code and approve the 8-digit pairing code. For a headless host, run `tarobird pair --ipv6-ddns`. Paired owner devices can sync the route while online or scan it under **Connection status & routes**.

Turn off Wi-Fi on the phone and test over an IPv6-capable mobile network. If the host reports that it is listening but the connection fails, check the AAAA record and the inbound IPv6 firewall rules. Devices reconnect to the same hostname after DDNS updates the record. Restart the host to load renewed certificates. To disable the listener, remove `ipv6Ddns` and restart the host.

For HTTP on Windows and Android, use the example above with your hostname and port, restart the host, and scan its **IPv6 (DDNS) · HTTP** QR code. HTTP transmits chat and session data without encryption. Pairing approval still applies.
