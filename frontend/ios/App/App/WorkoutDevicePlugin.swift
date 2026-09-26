import Capacitor
import UIKit

@objc(WorkoutDevicePlugin)
public class WorkoutDevicePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WorkoutDevicePlugin"
    public let jsName = "WorkoutDevice"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setKeepAwake", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "vibrate", returnType: CAPPluginReturnPromise)
    ]

    @objc func setKeepAwake(_ call: CAPPluginCall) {
        let enabled = call.getBool("enabled") ?? false
        DispatchQueue.main.async {
            UIApplication.shared.isIdleTimerDisabled = enabled
            call.resolve()
        }
    }

    @objc func vibrate(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            call.resolve()
        }
    }
}
