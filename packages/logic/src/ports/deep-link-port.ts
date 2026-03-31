export interface DeepLinkHandlerPort {
  dispose(): void;
}

export interface DeepLinkPort {
  setupDeepLinkHandler(navigate: (path: string) => void): Promise<DeepLinkHandlerPort>;
}
