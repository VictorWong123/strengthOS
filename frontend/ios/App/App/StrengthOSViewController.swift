import Capacitor

class StrengthOSViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(WorkoutDevicePlugin())
    }
}
