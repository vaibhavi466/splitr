"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { api } from "@/convex/_generated/api";
import { useConvexMutation, useConvexQuery } from "@/hooks/use-convex-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { X, UserPlus, UserRoundPlus, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

const groupSchema = z.object({
  name: z.string().min(1, "Group name is required"),
  description: z.string().optional(),
});

const guestSchema = z.object({
  guestName: z.string().min(2, "Name must be at least 2 characters"),
  guestPhone: z
    .string()
    .min(8, "Enter a valid phone number")
    .regex(/^[+\d\s\-()]+$/, "Invalid phone number format"),
});

export function CreateGroupModal({ isOpen, onClose, onSuccess }) {
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [commandOpen, setCommandOpen] = useState(false);
  const [isAddingGuest, setIsAddingGuest] = useState(false);

  const { data: currentUser } = useConvexQuery(api.users.getCurrentUser);
  const createGroup = useConvexMutation(api.contacts.createGroup);
  const createPlaceholder = useConvexMutation(api.users.createPlaceholderUser);

  const { data: searchResults, isLoading: isSearching } = useConvexQuery(
    api.users.searchUsers,
    { query: searchQuery }
  );

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm({
    resolver: zodResolver(groupSchema),
    defaultValues: { name: "", description: "" },
  });

  const {
    register: registerGuest,
    handleSubmit: handleGuestSubmit,
    formState: { errors: guestErrors, isSubmitting: isAddingGuestSubmitting },
    reset: resetGuest,
    watch: watchGuest,
  } = useForm({
    resolver: zodResolver(guestSchema),
    defaultValues: { guestName: "", guestPhone: "" },
  });

  const addMember = (user) => {
    if (!selectedMembers.some((m) => m.id === user.id)) {
      setSelectedMembers([...selectedMembers, user]);
    }
    setCommandOpen(false);
  };

  const removeMember = (userId) => {
    setSelectedMembers(selectedMembers.filter((m) => m.id !== userId));
  };

  /* ─── Add a non-Splitr person via name + phone ──────────────────────── */
  const onAddGuest = async (data) => {
    try {
      // Check not already added by phone
      if (selectedMembers.some((m) => m.phone === data.guestPhone)) {
        toast.error("This phone number has already been added.");
        return;
      }

      const placeholderId = await createPlaceholder.mutate({
        name: data.guestName,
        phone: data.guestPhone,
      });

      const newGuest = {
        id: placeholderId,
        name: data.guestName,
        phone: data.guestPhone,
        imageUrl: null,
        isPlaceholder: true,
      };

      setSelectedMembers((prev) => [...prev, newGuest]);
      resetGuest();
      setIsAddingGuest(false);
      toast.success(`${data.guestName} added as guest member`);
    } catch (error) {
      toast.error("Failed to add guest: " + error.message);
    }
  };

  const onSubmit = async (data) => {
    try {
      const memberIds = selectedMembers.map((member) => member.id);
      const groupId = await createGroup.mutate({
        name: data.name,
        description: data.description,
        members: memberIds,
      });

      toast.success("Group created successfully!");
      reset();
      setSelectedMembers([]);
      onClose();
      if (onSuccess) onSuccess(groupId);
    } catch (error) {
      toast.error("Failed to create group: " + error.message);
    }
  };

  const handleClose = () => {
    reset();
    resetGuest();
    setSelectedMembers([]);
    setIsAddingGuest(false);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create New Group</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Group Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Group Name</Label>
            <Input
              id="name"
              placeholder="Enter group name"
              {...register("name")}
            />
            {errors.name && (
              <p className="text-sm text-red-500">{errors.name.message}</p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description (Optional)</Label>
            <Textarea
              id="description"
              placeholder="Enter group description"
              {...register("description")}
            />
          </div>

          {/* Members Section */}
          <div className="space-y-2">
            <Label>Members</Label>

            {/* Selected member badges */}
            <div className="flex flex-wrap gap-2 mb-2">
              {/* Current user (always included) */}
              {currentUser && (
                <Badge variant="secondary" className="px-3 py-1">
                  <Avatar className="h-5 w-5 mr-2">
                    <AvatarImage src={currentUser.imageUrl} />
                    <AvatarFallback>
                      {currentUser.name?.charAt(0) || "?"}
                    </AvatarFallback>
                  </Avatar>
                  <span>{currentUser.name} (You)</span>
                </Badge>
              )}

              {selectedMembers.map((member) => (
                <Badge
                  key={member.id}
                  variant={member.isPlaceholder ? "outline" : "secondary"}
                  className={`px-3 py-1 ${member.isPlaceholder ? "border-dashed border-amber-500 text-amber-700 dark:text-amber-400" : ""}`}
                >
                  <Avatar className="h-5 w-5 mr-2">
                    <AvatarImage src={member.imageUrl} />
                    <AvatarFallback className={member.isPlaceholder ? "bg-amber-100 text-amber-700 text-xs" : ""}>
                      {member.isPlaceholder ? "?" : member.name?.charAt(0) || "?"}
                    </AvatarFallback>
                  </Avatar>
                  <span>{member.name}</span>
                  {member.isPlaceholder && (
                    <span className="ml-1 text-xs opacity-60">(guest)</span>
                  )}
                  <button
                    type="button"
                    onClick={() => removeMember(member.id)}
                    className="ml-2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>

            {/* Add member buttons row */}
            <Tabs defaultValue="search" className="w-full">
              <TabsList className="grid w-full grid-cols-2 h-9 text-xs">
                <TabsTrigger value="search" className="gap-1 text-xs">
                  <UserPlus className="h-3.5 w-3.5" />
                  Splitr Users
                </TabsTrigger>
                <TabsTrigger value="guest" className="gap-1 text-xs">
                  <Phone className="h-3.5 w-3.5" />
                  Add by Phone
                </TabsTrigger>
              </TabsList>

              {/* Tab: Search registered Splitr users */}
              <TabsContent value="search" className="mt-2">
                <Popover open={commandOpen} onOpenChange={setCommandOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full h-9 gap-1 text-xs justify-start text-muted-foreground"
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      Search by name or email…
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="p-0 w-80" align="start" side="bottom">
                    <Command>
                      <CommandInput
                        placeholder="Search by name or email..."
                        value={searchQuery}
                        onValueChange={setSearchQuery}
                      />
                      <CommandList>
                        <CommandEmpty>
                          {searchQuery.length < 2 ? (
                            <p className="py-3 px-4 text-sm text-center text-muted-foreground">
                              Type at least 2 characters to search
                            </p>
                          ) : isSearching ? (
                            <p className="py-3 px-4 text-sm text-center text-muted-foreground">
                              Searching...
                            </p>
                          ) : (
                            <div className="py-3 px-4 text-center">
                              <p className="text-sm text-muted-foreground">No Splitr users found</p>
                              <p className="text-xs text-muted-foreground mt-1">
                                Use the <strong>"Add by Phone"</strong> tab to add someone who isn't on Splitr yet
                              </p>
                            </div>
                          )}
                        </CommandEmpty>
                        <CommandGroup heading="Splitr Users">
                          {searchResults
                            ?.filter((u) => !selectedMembers.some((m) => m.id === u.id))
                            .map((user) => (
                              <CommandItem
                                key={user.id}
                                value={user.name + user.email}
                                onSelect={() => addMember(user)}
                              >
                                <div className="flex items-center gap-2">
                                  <Avatar className="h-6 w-6">
                                    <AvatarImage src={user.imageUrl} />
                                    <AvatarFallback>
                                      {user.name?.charAt(0) || "?"}
                                    </AvatarFallback>
                                  </Avatar>
                                  <div className="flex flex-col">
                                    <span className="text-sm">{user.name}</span>
                                    <span className="text-xs text-muted-foreground">
                                      {user.email}
                                    </span>
                                  </div>
                                </div>
                              </CommandItem>
                            ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </TabsContent>

              {/* Tab: Add non-Splitr person by name + phone */}
              <TabsContent value="guest" className="mt-2">
                <div className="rounded-lg border border-dashed border-amber-400 bg-amber-50 dark:bg-amber-950/20 p-3 space-y-3">
                  <div className="flex items-start gap-2">
                    <UserRoundPlus className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
                        Adding someone who doesn't use Splitr?
                      </p>
                      <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                        They'll be added as a <strong>guest member</strong>. When they join Splitr later with the same phone number, their account will automatically merge with their expense history.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label htmlFor="guestName" className="text-xs">Full Name *</Label>
                      <Input
                        id="guestName"
                        placeholder="e.g. Rahul Singh"
                        className="h-8 text-sm"
                        {...registerGuest("guestName")}
                      />
                      {guestErrors.guestName && (
                        <p className="text-xs text-red-500">{guestErrors.guestName.message}</p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="guestPhone" className="text-xs">Phone Number *</Label>
                      <Input
                        id="guestPhone"
                        placeholder="+91 98765 43210"
                        className="h-8 text-sm"
                        {...registerGuest("guestPhone")}
                      />
                      {guestErrors.guestPhone && (
                        <p className="text-xs text-red-500">{guestErrors.guestPhone.message}</p>
                      )}
                    </div>
                  </div>

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="w-full h-8 text-xs border-amber-400 text-amber-800 hover:bg-amber-100 dark:text-amber-300"
                    onClick={handleGuestSubmit(onAddGuest)}
                    disabled={isAddingGuestSubmitting}
                  >
                    {isAddingGuestSubmitting ? (
                      "Adding..."
                    ) : (
                      <>
                        <UserRoundPlus className="h-3.5 w-3.5 mr-1" />
                        Add as Guest Member
                      </>
                    )}
                  </Button>
                </div>
              </TabsContent>
            </Tabs>

            {selectedMembers.length === 0 && (
              <p className="text-sm text-amber-600">
                Add at least one other person to the group
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || selectedMembers.length === 0}
            >
              {isSubmitting ? "Creating..." : "Create Group"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}