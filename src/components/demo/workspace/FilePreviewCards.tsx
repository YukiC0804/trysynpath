/** Image previews for manufacturing drawings and spec sheets */

const DEFAULT_DRAWING_SRC = '/se-housing-4421-drawing.png';
const DEFAULT_SPEC_SRC = '/se-housing-tool-build-spec.png';

export function PartDrawingPreview({
  filename = 'drawing.tif',
  title = 'Part Drawing',
  imageSrc = DEFAULT_DRAWING_SRC,
  alt = 'Part engineering drawing',
}: {
  filename?: string;
  title?: string;
  imageSrc?: string;
  alt?: string;
  partName?: string;
  customer?: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-neutral-700">
      <div className="bg-neutral-950 px-3 py-2">
        <p className="text-xs font-medium text-white">
          {filename}, <span className="font-normal text-neutral-400">{title}</span>
        </p>
      </div>
      <div className="overflow-hidden bg-white">
        <img src={imageSrc} alt={alt} className="h-auto w-full object-contain" />
      </div>
    </div>
  );
}

export function SpecSheetPreview({
  filename = 'specs.xlsx',
  title = 'Tool Build Spec',
  imageSrc = DEFAULT_SPEC_SRC,
  alt = 'Tool build specification sheet',
}: {
  filename?: string;
  title?: string;
  imageSrc?: string;
  alt?: string;
  rows?: { field: string; value: string; checked?: boolean }[];
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-neutral-700">
      <div className="bg-[#217346] px-3 py-2">
        <p className="text-xs font-medium text-white">
          {filename}, <span className="font-normal text-green-100">{title}</span>
        </p>
      </div>
      <div className="overflow-hidden bg-white">
        <img src={imageSrc} alt={alt} className="h-auto w-full object-contain" />
      </div>
    </div>
  );
}
