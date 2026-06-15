package com.gkouvas.brisk.hce

import android.util.Base64
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * JS bridge for the Brisk Terminal HCE. `setNdefMessage` activates emulation
 * with the given NDEF message (base64); `stop` deactivates it. The actual tag
 * responses are served by HceNdefService when a customer taps.
 */
class BriskHceModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "BriskHce"

  @ReactMethod
  fun setNdefMessage(base64: String, promise: Promise) {
    try {
      HceNdefService.ndefMessage = Base64.decode(base64, Base64.DEFAULT)
      HceNdefService.active = true
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("HCE_SET_FAILED", e)
    }
  }

  @ReactMethod
  fun stop(promise: Promise) {
    HceNdefService.active = false
    HceNdefService.ndefMessage = null
    promise.resolve(true)
  }
}
