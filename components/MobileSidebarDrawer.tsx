"use client";

import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import { useT } from "@/lib/i18n";

interface MobileSidebarDrawerProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export default function MobileSidebarDrawer({
  open,
  onClose,
  children,
}: MobileSidebarDrawerProps) {
  const t = useT();
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="left" className="w-72 p-0 lg:hidden">
        <VisuallyHidden.Root>
          <SheetTitle>{t("layout_sidebar")}</SheetTitle>
        </VisuallyHidden.Root>
        {children}
      </SheetContent>
    </Sheet>
  );
}
