import UIKit
import Capacitor

// The app's web view controller: registers the app's own native plugins
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(NativeSttPlugin())
    }
}
