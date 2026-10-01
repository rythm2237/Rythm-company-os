"use client";

import { Button } from "@/components/ui/Button";

export function ProjectReportActions(){
  return <Button type="button" onClick={()=>window.print()}>Print / Save PDF</Button>;
}
