import UIKit
import WebKit
import Capacitor

// The app's web view controller: registers the app's own native plugins,
// tells the page the real safe area, and keeps the launch image up until the
// page has loaded
class MainViewController: CAPBridgeViewController {
    private var loadingObservation: NSKeyValueObservation?
    private var launchCover: UIView?
    private var injectedInsets: UIEdgeInsets?

    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(NativeSttPlugin())
        // Every finished load (first open, reload, login → app): a new
        // document, so the safe area again; the first one lifts the cover
        loadingObservation = webView?.observe(\.isLoading, options: [.new]) { [weak self] webView, _ in
            guard !webView.isLoading else { return }
            DispatchQueue.main.async {
                self?.injectSafeArea(force: true)
                self?.hideLaunchCover()
            }
        }
    }

    // The site is loaded over the network on every launch: instead of a blank
    // white web view meanwhile, the launch image stays (at most 10 s, so an
    // error page or a stalled load still shows)
    override open func viewDidLoad() {
        super.viewDidLoad()
        guard let image = UIImage(named: "Splash") else { return }
        let cover = UIImageView(image: image)
        cover.contentMode = .scaleAspectFill
        cover.clipsToBounds = true
        cover.backgroundColor = .systemBackground
        cover.frame = view.bounds
        cover.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(cover)
        launchCover = cover
        DispatchQueue.main.asyncAfter(deadline: .now() + 10) { [weak self] in self?.hideLaunchCover() }
    }

    private func hideLaunchCover() {
        guard let cover = launchCover else { return }
        launchCover = nil
        UIView.animate(withDuration: 0.2, animations: { cover.alpha = 0 }, completion: { _ in cover.removeFromSuperview() })
    }

    override open func viewSafeAreaInsetsDidChange() {
        super.viewSafeAreaInsetsDidChange()
        injectSafeArea(force: false)
    }

    // Some iOS 26 / 27 web views report env(safe-area-inset-*) as 0 although
    // the page is drawn under the status bar, so its top bar sat under the
    // clock and couldn't be tapped. UIKit's safe area is right: the page gets
    // it as --safe-area-inset-* (the CSS takes the larger of the two). Set on
    // every new document before its first paint (a user script at document
    // start) and on the current one.
    private func injectSafeArea(force: Bool) {
        guard let webView = webView else { return }
        let insets = view.window?.safeAreaInsets ?? view.safeAreaInsets
        let changed = insets != injectedInsets
        guard changed || force else { return }
        // A constructed style sheet, not the <html> element's style: the
        // page's hydration rewrites that element's attributes
        let js = String(
            format: "(function(d){var c=':root{--safe-area-inset-top:%.0fpx;--safe-area-inset-right:%.0fpx;--safe-area-inset-bottom:%.0fpx;--safe-area-inset-left:%.0fpx}';try{var s=window.__ablSafeArea;if(!s){s=window.__ablSafeArea=new CSSStyleSheet();d.adoptedStyleSheets=d.adoptedStyleSheets.concat([s]);}s.replaceSync(c);}catch(e){}})(document);",
            insets.top, insets.right, insets.bottom, insets.left
        )
        if changed {
            injectedInsets = insets
            // Scripts run in the order added: the latest values win (a handful
            // over the app's life: launch, rotation)
            webView.configuration.userContentController.addUserScript(
                WKUserScript(source: js, injectionTime: .atDocumentStart, forMainFrameOnly: true)
            )
        }
        webView.evaluateJavaScript(js, completionHandler: nil)
    }
}
