"use client";

import { useState } from "react";
import { FileCode, FileText, File, ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { ARTIFACT_ACTION, type ArtifactAction } from "@/lib/constants";

export interface Artifact {
  path: string;
  action: ArtifactAction;
  description?: string;
  diff?: string;
}

interface ArtifactRendererProps {
  artifacts: Artifact[];
}

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"]);
const CODE_EXTS = new Set([".py", ".ts", ".tsx", ".js", ".jsx", ".go", ".rs", ".java", ".sh", ".md", ".json", ".yaml", ".yml"]);

function ArtifactFileIcon({ path }: { path: string }) {
  const ext = path.slice(path.lastIndexOf(".")).toLowerCase();
  if (IMAGE_EXTS.has(ext)) return <File className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
  if (CODE_EXTS.has(ext)) return <FileCode className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
  return <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
}

function ActionBadge({ action }: { action: ArtifactAction }) {
  const styles: Record<ArtifactAction, string> = {
    [ARTIFACT_ACTION.CREATED]: "bg-green-100 text-green-700",
    [ARTIFACT_ACTION.MODIFIED]: "bg-blue-100 text-blue-700",
    [ARTIFACT_ACTION.DELETED]: "bg-red-100 text-red-700",
  };

  return (
    <Badge
      variant="secondary"
      className={`text-[10px] px-1.5 py-0 h-4 font-medium ${styles[action]}`}
    >
      {action}
    </Badge>
  );
}

function ArtifactItem({ artifact }: { artifact: Artifact }) {
  const [isOpen, setIsOpen] = useState(false);
  const hasDiff = artifact.action === ARTIFACT_ACTION.MODIFIED && !!artifact.diff;

  return (
    <div className="rounded border border-border bg-muted/30 px-2.5 py-2 text-xs">
      {/* File row: icon + path + badge */}
      <div className="flex items-center gap-1.5 min-w-0">
        <ArtifactFileIcon path={artifact.path} />
        <span
          className="font-mono text-xs text-blue-500 cursor-pointer hover:underline truncate flex-1 min-w-0"
          title={artifact.path}
        >
          {artifact.path}
        </span>
        <ActionBadge action={artifact.action} />
      </div>

      {/* Description for created files */}
      {artifact.description && (
        <p className="mt-1 text-xs text-muted-foreground pl-5">
          {artifact.description}
        </p>
      )}

      {/* Collapsible diff for modified files */}
      {hasDiff && (
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleTrigger className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors pl-5">
            {isOpen ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            <span>{isOpen ? "Hide diff" : "Show diff"}</span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-1.5 rounded overflow-hidden border border-border">
              <SyntaxHighlighter
                language="diff"
                style={oneDark}
                customStyle={{
                  margin: 0,
                  borderRadius: 0,
                  fontSize: "11px",
                  lineHeight: "1.4",
                  padding: "8px 10px",
                  maxHeight: "200px",
                  overflowY: "auto",
                }}
              >
                {artifact.diff!}
              </SyntaxHighlighter>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

export function ArtifactRenderer({ artifacts }: ArtifactRendererProps) {
  if (!artifacts || artifacts.length === 0) {
    return null;
  }

  return (
    <div className="mt-2 flex flex-col gap-1.5">
      {artifacts.map((artifact, idx) => (
        <ArtifactItem key={`${artifact.path}-${idx}`} artifact={artifact} />
      ))}
    </div>
  );
}
