import SwiftUI
import UIKit

struct ViewControllerResolver: UIViewControllerRepresentable {
  final class ResolverViewController: UIViewController {
    var onResolve: (UIViewController) -> Void
    private var didResolve = false

    init(onResolve: @escaping (UIViewController) -> Void) {
      self.onResolve = onResolve
      super.init(nibName: nil, bundle: nil)
      view.backgroundColor = .clear
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
      fatalError("init(coder:) has not been implemented")
    }

    override func viewDidAppear(_ animated: Bool) {
      super.viewDidAppear(animated)

      guard !didResolve, view.window != nil else { return }
      didResolve = true
      onResolve(self)
    }
  }

  var onResolve: (UIViewController) -> Void

  func makeUIViewController(context: Context) -> UIViewController {
    ResolverViewController(onResolve: onResolve)
  }

  func updateUIViewController(_ uiViewController: UIViewController, context: Context) {}
}
