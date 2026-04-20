import React from "react";
import { Button } from "../../ui/Button";
import { cn } from "../../ui/utils/cn";

type ActionButtonsProps = React.HTMLAttributes<HTMLDivElement>;

export const ActionButtons: React.FC<ActionButtonsProps> = ({ className, ...props }) => (
  <div className={cn("flex justify-end gap-2", className)} {...props} />
);

export const EditActionButton: React.FC<React.ComponentProps<typeof Button>> = (props) => (
  <Button variant="secondary" size="sm" className="h-8 w-8 px-0" {...props} />
);

export const DeleteActionButton: React.FC<React.ComponentProps<typeof Button>> = (props) => (
  <Button
    variant="secondary"
    size="sm"
    className="h-8 w-8 border-rose-200 px-0 text-rose-700 hover:bg-rose-50"
    {...props}
  />
);

