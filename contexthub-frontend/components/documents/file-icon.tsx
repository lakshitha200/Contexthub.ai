import { FileCode, FileSpreadsheet, FileText, FileType, File as FileIcon } from "lucide-react";
import { cn } from "@/lib/utils";

function meta(mimeType: string, filename: string): { Icon: typeof FileIcon; color: string } {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (mimeType.includes("pdf") || ext === "pdf") return { Icon: FileType, color: "#e5484d" };
  if (mimeType.includes("spreadsheet") || ["xlsx", "xls", "csv"].includes(ext))
    return { Icon: FileSpreadsheet, color: "#22a06b" };
  if (mimeType.includes("word") || ["doc", "docx"].includes(ext))
    return { Icon: FileText, color: "#2f6fed" };
  if (["md", "markdown", "json", "txt"].includes(ext)) return { Icon: FileCode, color: "#8b7dff" };
  return { Icon: FileIcon, color: "#71717a" };
}

export function FileTypeIcon({
  mimeType,
  filename,
  size = 40,
  className,
}: {
  mimeType: string;
  filename: string;
  size?: number;
  className?: string;
}) {
  const { Icon, color } = meta(mimeType, filename);
  return (
    <span
      className={cn("grid shrink-0 place-items-center rounded-lg", className)}
      style={{ width: size, height: size, background: `${color}1a`, color }}
    >
      <Icon style={{ width: size * 0.5, height: size * 0.5 }} />
    </span>
  );
}
