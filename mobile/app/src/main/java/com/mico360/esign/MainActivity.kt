package com.mico360.esign

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient

/**
 * eSign MICO360 mobile client.
 *
 * Hosts a full-screen WebView that loads a self-contained mobile UI bundled in
 * assets (index.html). That UI talks to the configured eSign MICO360 server's
 * REST API for login, pending approvals, document review, and approve/reject.
 *
 * Outbound http(s) navigations (e.g. "Open PDF") are handed to the system so
 * the device's PDF viewer / browser opens them.
 */
class MainActivity : Activity() {

    private lateinit var web: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        web = WebView(this)
        setContentView(web)

        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true       // localStorage for server URL + token
            allowFileAccess = true
            loadWithOverviewMode = true
            useWideViewPort = true
        }

        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url.toString()
                // The app UI lives at file://; any http(s) navigation is an
                // external link (PDF view/download) -> open it system-side.
                if (url.startsWith("http://") || url.startsWith("https://")) {
                    startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                    return true
                }
                return false
            }
        }

        web.loadUrl("file:///android_asset/index.html")
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (web.canGoBack()) web.goBack() else super.onBackPressed()
    }
}
