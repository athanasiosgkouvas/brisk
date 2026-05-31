package com.gkouvas.brisk.hce

import android.nfc.cardemulation.HostApduService
import android.os.Bundle

/**
 * Emulates an NFC Forum Type-4 tag exposing a single NDEF message (the Brisk
 * invoice). The OS routes APDUs here when a reader selects our AID
 * (D2760000850101, registered in aid_list.xml). The message + active flag are
 * set from JS via BriskHceModule.
 *
 * Implements the minimal Type-4 read flow: SELECT AID -> SELECT CC -> READ CC
 * -> SELECT NDEF -> READ NDEF (NLEN-prefixed message).
 */
class HceNdefService : HostApduService() {
  companion object {
    @Volatile var ndefMessage: ByteArray? = null
    @Volatile var active: Boolean = false

    private val SELECT_AID = byteArrayOf(
      0x00, 0xA4.toByte(), 0x04, 0x00, 0x07,
      0xD2.toByte(), 0x76, 0x00, 0x00, 0x85.toByte(), 0x01, 0x01,
    )
    private val SELECT_CC = byteArrayOf(0x00, 0xA4.toByte(), 0x00, 0x0C, 0x02, 0xE1.toByte(), 0x03)
    private val SELECT_NDEF = byteArrayOf(0x00, 0xA4.toByte(), 0x00, 0x0C, 0x02, 0xE1.toByte(), 0x04)

    private val OK = byteArrayOf(0x90.toByte(), 0x00)
    private val FAIL = byteArrayOf(0x6A, 0x82.toByte())

    // Capability Container: NDEF file E104, max size 0x7FFF, read-only.
    private val CC_FILE = byteArrayOf(
      0x00, 0x0F, 0x20, 0x00, 0x3B, 0x00, 0x34,
      0x04, 0x06, 0xE1.toByte(), 0x04, 0x7F, 0xFF.toByte(), 0x00, 0xFF.toByte(),
    )
  }

  // 0 = none, 1 = CC, 2 = NDEF
  private var selectedFile = 0

  override fun processCommandApdu(commandApdu: ByteArray?, extras: Bundle?): ByteArray {
    val apdu = commandApdu ?: return FAIL

    if (apdu.startsWith(SELECT_AID)) {
      if (!active || ndefMessage == null) return FAIL
      selectedFile = 0
      return OK
    }
    if (apdu.startsWith(SELECT_CC)) {
      selectedFile = 1
      return OK
    }
    if (apdu.startsWith(SELECT_NDEF)) {
      selectedFile = 2
      return OK
    }

    // READ BINARY: 00 B0 <offHi> <offLo> <Le>
    if (apdu.size >= 5 && apdu[0] == 0x00.toByte() && apdu[1] == 0xB0.toByte()) {
      val offset = ((apdu[2].toInt() and 0xFF) shl 8) or (apdu[3].toInt() and 0xFF)
      var le = apdu[4].toInt() and 0xFF
      if (le == 0) le = 256
      val file = when (selectedFile) {
        1 -> CC_FILE
        2 -> buildNdefFile()
        else -> return FAIL
      }
      if (offset > file.size) return FAIL
      val end = minOf(offset + le, file.size)
      return file.copyOfRange(offset, end) + OK
    }

    return FAIL
  }

  private fun buildNdefFile(): ByteArray {
    val msg = ndefMessage ?: ByteArray(0)
    val nlen = byteArrayOf(((msg.size shr 8) and 0xFF).toByte(), (msg.size and 0xFF).toByte())
    return nlen + msg
  }

  override fun onDeactivated(reason: Int) {
    selectedFile = 0
  }
}

private fun ByteArray.startsWith(prefix: ByteArray): Boolean {
  if (this.size < prefix.size) return false
  for (i in prefix.indices) if (this[i] != prefix[i]) return false
  return true
}
