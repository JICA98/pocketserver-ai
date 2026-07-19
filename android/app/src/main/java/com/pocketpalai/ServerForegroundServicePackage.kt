package com.pocketpal

import com.facebook.react.TurboReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.pocketpal.specs.NativeServerForegroundServiceSpec

class ServerForegroundServicePackage : TurboReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? {
    return if (name == NativeServerForegroundServiceSpec.NAME) {
      ServerForegroundServiceModule(reactContext)
    } else {
      null
    }
  }

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider {
    return ReactModuleInfoProvider {
      mapOf(
        NativeServerForegroundServiceSpec.NAME to ReactModuleInfo(
          NativeServerForegroundServiceSpec.NAME,
          NativeServerForegroundServiceSpec.NAME,
          false,
          false,
          false,
          false,
          true
        )
      )
    }
  }
}
