import { useState } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { cn } from './ui/utils';

interface MemberLookupProps {
  onSearch: (query: string) => void;
  isLoading: boolean;
  className?: string;
}

export function MemberLookup({ onSearch, isLoading, className }: MemberLookupProps) {
  const [query, setQuery] = useState('');

  const handleInputChange = (value: string) => {
    setQuery(value);
    onSearch(value.trim());
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query.trim());
    }
  };

  return (
    <Card className={cn("border border-[#cfe8ff] bg-white/90 shadow-none backdrop-blur-sm", className)}>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2">
          <Search className="w-5 h-5 text-[#1A2B47]" />
          Member Lookup
        </CardTitle>
        <CardDescription>
          Search members by member ID, mobile number, or name
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Try MEM001, 5551234567, or John"
              value={query}
              onChange={(e) => handleInputChange(e.target.value)}
              className="h-11 rounded-xl border-[#d7e3f3] bg-[#f7f9fc] pl-10"
              disabled={isLoading}
            />
          </div>
          <Button
            type="submit"
            disabled={isLoading || !query.trim()}
            className="h-11 rounded-xl bg-[#1A2B47] px-6 text-white hover:bg-[#23385a]"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Searching...
              </>
            ) : (
              <>
                <Search className="w-4 h-4 mr-2" />
                Search
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
