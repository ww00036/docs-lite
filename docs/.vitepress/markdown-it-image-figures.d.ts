declare module "markdown-it-image-figures" {
  type ImageFiguresOptions = {
    figcaption?: boolean;
    classes?: string;
    dataType?: boolean;
    lazy?: boolean;
    tabindex?: boolean;
    link?: boolean;
    async?: boolean;
  };

  const markdownItImageFigures: (md: unknown, options?: ImageFiguresOptions) => void;
  export default markdownItImageFigures;
}
