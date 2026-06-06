import React, { useState, useEffect, useMemo } from "react";
import { 
  BookOpen, 
  Video, 
  ClipboardList, 
  BarChart3, 
  User, 
  LogOut, 
  LayoutDashboard, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  ChevronRight, 
  Search, 
  Filter, 
  ShieldCheck, 
  AlertCircle,
  Menu,
  X,
  PlayCircle,
  FileText,
  ExternalLink,
  BrainCircuit,
  History,
  Presentation
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { apiRequest } from "@/src/lib/api";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  Cell 
} from "recharts";

// --- Types ---
type Role = "admin" | "student";

interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: Role;
}

interface Question {
  id: string;
  section: "Quantitative" | "DILR" | "VARC";
  questionText: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  difficulty: string;
}

// --- Components ---

const SidebarItem = ({ icon: Icon, label, active, onClick }: { icon: any, label: string, active: boolean, onClick: () => void }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
      active 
        ? "bg-primary text-primary-foreground shadow-md" 
        : "text-muted-foreground hover:bg-secondary hover:text-foreground"
    }`}
  >
    <Icon size={20} />
    <span className="font-medium">{label}</span>
  </button>
);

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [loading, setLoading] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const [showMobileHeader, setShowMobileHeader] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > lastScrollY && window.scrollY > 100) {
        setShowMobileHeader(false);
      } else {
        setShowMobileHeader(true);
      }
      setLastScrollY(window.scrollY);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [lastScrollY]);

  // Auth check
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isMobileMenuOpen]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      apiRequest("/profile")
        .then(setUser)
        .catch(() => localStorage.removeItem("token"))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("token");
    setUser(null);
    toast.success("Logged out successfully");
  };

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full"
        />
      </div>
    );
  }

  if (!user) {
    return <LoginPage onLogin={setUser} />;
  }

  return (
    <div className="min-h-screen bg-secondary/30 flex flex-col md:flex-row">
      <Toaster position="top-right" />
      
      {/* Mobile Header */}
      <div className={`md:hidden flex items-center justify-between p-4 bg-background border-b sticky top-0 z-50 transition-transform duration-300 ${showMobileHeader ? "translate-y-0" : "-translate-y-full"}`}>
        <div className="flex items-center gap-2">
          <div className="bg-primary p-1.5 rounded-lg">
            <BrainCircuit className="text-white" size={20} />
          </div>
          <span className="font-bold text-lg tracking-tight">GMAT Prep Elite</span>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
          {isMobileMenuOpen ? <X /> : <Menu />}
        </Button>
      </div>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="fixed inset-0 bg-white dark:bg-slate-950 z-[60] md:hidden"
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 z-[70] w-72 bg-background border-r shadow-2xl md:hidden"
            >
              <div className="flex flex-col h-full p-6">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-3">
                    <div className="bg-primary p-2 rounded-xl text-white shadow-lg shadow-primary/20">
                      <BrainCircuit size={24} />
                    </div>
                    <span className="font-bold text-xl tracking-tight">GMAT Prep Elite</span>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setIsMobileMenuOpen(false)}>
                    <X size={20} />
                  </Button>
                </div>
                <nav className="flex-1 space-y-2">
                  <SidebarItem icon={LayoutDashboard} label="Dashboard" active={activeTab === "dashboard"} onClick={() => { setActiveTab("dashboard"); setIsMobileMenuOpen(false); }} />
                  <SidebarItem icon={BookOpen} label="Course Materials" active={activeTab === "courses"} onClick={() => { setActiveTab("courses"); setIsMobileMenuOpen(false); }} />
                  <SidebarItem icon={Video} label="Video Lectures" active={activeTab === "videos"} onClick={() => { setActiveTab("videos"); setIsMobileMenuOpen(false); }} />
                  <SidebarItem icon={ClipboardList} label="Daily Practice" active={activeTab === "daily-test"} onClick={() => { setActiveTab("daily-test"); setIsMobileMenuOpen(false); }} />
                  <SidebarItem icon={History} label="Test History" active={activeTab === "history"} onClick={() => { setActiveTab("history"); setIsMobileMenuOpen(false); }} />
                  <SidebarItem icon={BarChart3} label="Analytics" active={activeTab === "analytics"} onClick={() => { setActiveTab("analytics"); setIsMobileMenuOpen(false); }} />
                  
                  {user.role === "admin" && (
                    <>
                      <div className="pt-6 pb-2 text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] px-3">Admin Panel</div>
                      <SidebarItem icon={ShieldCheck} label="Admin Dashboard" active={activeTab === "admin"} onClick={() => { setActiveTab("admin"); setIsMobileMenuOpen(false); }} />
                    </>
                  )}
                </nav>
                <div className="pt-6 border-t">
                  <div className="flex items-center gap-3 px-3 mb-6">
                    <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary font-bold text-lg">
                      {user.name.charAt(0)}
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <p className="font-bold truncate">{user.name}</p>
                      <p className="text-xs text-muted-foreground truncate capitalize">{user.role}</p>
                    </div>
                  </div>
                  <SidebarItem icon={LogOut} label="Logout" active={false} onClick={handleLogout} />
                </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-background border-r sticky top-0 h-screen">
        <div className="flex flex-col h-full p-4">
          <div className="flex items-center gap-3 mb-8 px-2 mt-2">
            <div className="bg-primary p-2 rounded-xl shadow-lg shadow-primary/20">
              <BrainCircuit className="text-white" size={24} />
            </div>
            <span className="font-bold text-xl tracking-tight">GMAT Prep Elite</span>
          </div>

          <nav className="flex-1 space-y-1">
            <SidebarItem icon={LayoutDashboard} label="Dashboard" active={activeTab === "dashboard"} onClick={() => setActiveTab("dashboard")} />
            <SidebarItem icon={BookOpen} label="Course Materials" active={activeTab === "courses"} onClick={() => setActiveTab("courses")} />
            <SidebarItem icon={Video} label="Video Lectures" active={activeTab === "videos"} onClick={() => setActiveTab("videos")} />
            <SidebarItem icon={ClipboardList} label="Daily Practice" active={activeTab === "daily-test"} onClick={() => setActiveTab("daily-test")} />
            <SidebarItem icon={History} label="Test History" active={activeTab === "history"} onClick={() => setActiveTab("history")} />
            <SidebarItem icon={BarChart3} label="Analytics" active={activeTab === "analytics"} onClick={() => setActiveTab("analytics")} />
            
            {user.role === "admin" && (
              <>
                <div className="pt-4 pb-2 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Admin Panel</div>
                <SidebarItem icon={ShieldCheck} label="Admin Dashboard" active={activeTab === "admin"} onClick={() => setActiveTab("admin")} />
              </>
            )}
          </nav>

          <div className="pt-4 border-t mt-auto">
            <div className="flex items-center gap-3 px-2 mb-4">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                {user.name.charAt(0)}
              </div>
              <div className="flex-1 overflow-hidden">
                <p className="text-sm font-semibold truncate">{user.name}</p>
                <p className="text-xs text-muted-foreground truncate capitalize">{user.role}</p>
              </div>
            </div>
            <SidebarItem icon={LogOut} label="Logout" active={false} onClick={handleLogout} />
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto p-4 md:p-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === "dashboard" && <Dashboard user={user} setActiveTab={setActiveTab} />}
            {activeTab === "courses" && <CourseMaterials />}
            {activeTab === "videos" && <VideoLectures />}
            {activeTab === "daily-test" && <DailyTest user={user} />}
            {activeTab === "history" && <TestHistory user={user} />}
            {activeTab === "analytics" && <Analytics user={user} />}
            {activeTab === "admin" && <AdminDashboard user={user} />}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

// --- Sub-Pages ---

function LoginPage({ onLogin }: { onLogin: (u: UserProfile) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await apiRequest("/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      localStorage.setItem("token", data.token);
      onLogin(data.user);
      toast.success("Welcome back!");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-secondary/30 p-4">
      <Card className="w-full max-w-md shadow-2xl border-none">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className="bg-primary p-3 rounded-2xl shadow-xl shadow-primary/20">
              <BrainCircuit className="text-white" size={32} />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">GMAT Prep Elite</CardTitle>
          <CardDescription>Login and Give wings to your GMAT prep.</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input 
                id="email" 
                type="email" 
                placeholder="student@example.com" 
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
                required 
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <button type="button" className="text-xs text-primary hover:underline">Forgot password?</button>
              </div>
              <Input 
                id="password" 
                type="password" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                required 
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button className="w-full h-11 text-base" type="submit" disabled={loading}>
              {loading ? "Signing in..." : "Sign In"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

function Dashboard({ user, setActiveTab }: { user: UserProfile, setActiveTab: (t: string) => void }) {
  const [stats, setStats] = useState({ attempted: 0, avgScore: 0, streak: 0 });
  const [announcements, setAnnouncements] = useState<any[]>([]);

  useEffect(() => {
    apiRequest("/performance").then(results => {
      if (results.length > 0) {
        const avg = results.reduce((a, b) => a + Number(b.totalScore), 0) / results.length;
        setStats({
          attempted: results.length,
          avgScore: Math.round(avg),
          streak: 3 // Mock streak
        });
      }
    });
    apiRequest("/announcements").then(setAnnouncements);
  }, []);

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Welcome back, {user.name.split(' ')[0]}! 👋</h1>
          <p className="text-muted-foreground">Here's what's happening with your preparation today.</p>
        </div>
        <div className="flex items-center gap-2 bg-background p-1 rounded-lg border shadow-sm">
          <Button variant="ghost" size="sm" className="gap-2">
            <Clock size={16} />
            <span>IST: {new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })}</span>
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-primary text-primary-foreground border-none shadow-lg shadow-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium opacity-80">Tests Attempted</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.attempted}</div>
          </CardContent>
        </Card>
        <Card className="shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Average Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.avgScore}%</div>
          </CardContent>
        </Card>
        <Card className="shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Current Streak</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold flex items-center gap-2">
              {stats.streak} Days 🔥
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <LayoutDashboard size={20} className="text-primary" />
            Quick Navigation
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {[
              { label: "Daily Test", icon: ClipboardList, tab: "daily-test", color: "bg-orange-500" },
              { label: "Courses", icon: BookOpen, tab: "courses", color: "bg-blue-500" },
              { label: "Videos", icon: Video, tab: "videos", color: "bg-purple-500" },
              { label: "Analytics", icon: BarChart3, tab: "analytics", color: "bg-green-500" },
              { label: "History", icon: History, tab: "history", color: "bg-slate-500" },
              { label: "Profile", icon: User, tab: "profile", color: "bg-pink-500" },
            ].map((item) => (
              <button
                key={item.label}
                onClick={() => setActiveTab(item.tab)}
                className="group flex flex-col items-center justify-center p-6 bg-background rounded-2xl border shadow-sm hover:shadow-md hover:border-primary/50 transition-all"
              >
                <div className={`${item.color} p-3 rounded-xl text-white mb-3 group-hover:scale-110 transition-transform`}>
                  <item.icon size={24} />
                </div>
                <span className="font-semibold text-sm">{item.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <AlertCircle size={20} className="text-primary" />
            Announcements
          </h2>
          <div className="space-y-4">
            {announcements.map((ann) => (
              <Card key={ann.id} className="shadow-sm border-l-4 border-l-primary">
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-sm font-bold">{ann.title}</CardTitle>
                  <CardDescription className="text-xs">{new Date(ann.createdDate).toLocaleDateString()}</CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <p className="text-sm text-muted-foreground">{ann.content}</p>
                </CardContent>
              </Card>
            ))}
            {announcements.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8 bg-background rounded-xl border border-dashed">No new announcements</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CourseMaterials() {
  const [materials, setMaterials] = useState<any[]>([]);
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");

  useEffect(() => {
    apiRequest("/course-materials").then(setMaterials);
  }, []);

  const filtered = materials.filter(m => {
    const matchesSearch = m.topicName.toLowerCase().includes(search.toLowerCase());
    if (filter === "All") return matchesSearch;
    
    const cat = (m.section || "").toLowerCase();
    const f = filter.toLowerCase();
    let matchesSection = cat === f;
    
    if (f === "quantitative") matchesSection = cat.includes("quant");
    else if (f === "dilr") matchesSection = cat.includes("dilr") || cat.includes("lrdi");
    else if (f === "varc") matchesSection = cat.includes("varc") || cat.includes("verbal");
    
    return matchesSection && matchesSearch;
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Course Materials</h1>
          <p className="text-muted-foreground">Access comprehensive study guides and resources.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
            <Input 
              placeholder="Search topics..." 
              className="pl-10 w-[200px] md:w-[300px]" 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Section" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Sections</SelectItem>
              <SelectItem value="Quantitative">Quantitative</SelectItem>
              <SelectItem value="DILR">DILR</SelectItem>
              <SelectItem value="VARC">VARC</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtered.length === 0 ? (
          <div className="col-span-full py-12 flex flex-col items-center justify-center text-center bg-background rounded-xl border border-dashed">
            <BookOpen className="h-12 w-12 text-muted-foreground mb-4 opacity-20" />
            <h3 className="font-semibold text-lg">No materials found</h3>
            <p className="text-muted-foreground max-w-sm px-4">
              We couldn't find any materials matching your selection. Try a different search term or section.
            </p>
          </div>
        ) : filtered.map((item) => item && (
          <Card key={item.id} className="group hover:shadow-lg transition-all border-t-4 border-t-primary">
            <CardHeader>
              <div className="flex justify-between items-start mb-2">
                <Badge variant="secondary" className="font-semibold">
                  {item.section}
                </Badge>
                <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Added {new Date(item.dateAdded).toLocaleDateString()}</span>
              </div>
              <CardTitle className="text-xl group-hover:text-primary transition-colors">{item.topicName}</CardTitle>
              <CardDescription className="line-clamp-2">{item.description}</CardDescription>
            </CardHeader>
            <CardFooter className="grid grid-cols-2 gap-3">
              <a 
                href={item.googleSheetLink} 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex h-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background px-2.5 text-sm font-medium transition-all hover:bg-muted hover:text-foreground gap-2"
              >
                <FileText size={16} />
                Sheets
              </a>
              <a 
                href={item.googleDriveLink} 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex h-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background px-2.5 text-sm font-medium transition-all hover:bg-muted hover:text-foreground gap-2"
              >
                <ExternalLink size={16} />
                Drive
              </a>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}

function VideoLectures() {
  const [videos, setVideos] = useState<any[]>([]);
  const [filter, setFilter] = useState("All");

  useEffect(() => {
    apiRequest("/video-lectures").then(setVideos);
  }, []);

  const filtered = videos.filter(v => {
    if (filter === "All") return true;
    const cat = (v.section || "").toLowerCase();
    const f = filter.toLowerCase();
    if (f === "quantitative") return cat.includes("quant");
    if (f === "dilr") return cat.includes("dilr") || cat.includes("lrdi");
    if (f === "varc") return cat.includes("varc") || cat.includes("verbal");
    return cat === f;
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Video Lectures</h1>
        <p className="text-muted-foreground">Learn from expert instructors at your own pace.</p>
      </header>

      <Tabs defaultValue="All" onValueChange={setFilter} className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="All">All Lectures</TabsTrigger>
          <TabsTrigger value="Quantitative">Quantitative</TabsTrigger>
          <TabsTrigger value="DILR">DILR</TabsTrigger>
          <TabsTrigger value="VARC">VARC</TabsTrigger>
        </TabsList>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.length === 0 ? (
            <div className="col-span-full py-12 flex flex-col items-center justify-center text-center bg-background rounded-xl border border-dashed">
              <Video className="h-12 w-12 text-muted-foreground mb-4 opacity-20" />
              <h3 className="font-semibold text-lg">No lectures found</h3>
              <p className="text-muted-foreground max-w-sm px-4">
                We haven't uploaded any video lectures for this section yet. 
                Please check back later or explore other sections.
              </p>
            </div>
          ) : filtered.map((video) => video && (
            <Card key={video.id} className="overflow-hidden group hover:shadow-xl transition-all">
              <div className="aspect-video bg-slate-100 relative flex items-center justify-center">
                <PlayCircle className="text-primary/40 group-hover:text-primary group-hover:scale-110 transition-all" size={64} />
                <div className="absolute bottom-3 right-3 bg-black/70 text-white text-[10px] font-bold px-2 py-1 rounded">
                  {video.duration} MIN
                </div>
              </div>
              <CardHeader className="p-5">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline" className="text-[10px] uppercase tracking-tighter">{video.section}</Badge>
                  <span className="text-xs text-muted-foreground">• {video.instructorName}</span>
                </div>
                <CardTitle className="text-lg leading-tight">{video.topicName}</CardTitle>
              </CardHeader>
                <CardFooter className="p-5 pt-0 gap-2">
                  <a 
                    href={video.googleDriveLink} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex-1 inline-flex h-8 items-center justify-center bg-primary text-primary-foreground rounded-lg px-2.5 text-sm font-medium transition-all hover:bg-primary/90 gap-2"
                  >
                    <PlayCircle size={16} />
                    Watch Now
                  </a>
                  <a 
                    href={video.googleSheetLink} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="size-8 inline-flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground transition-all"
                  >
                    <FileText size={18} />
                  </a>
                </CardFooter>
            </Card>
          ))}
        </div>
      </Tabs>
    </div>
  );
}

function DailyTest({ user }: { user: UserProfile }) {
  const [view, setView] = useState<"list" | "test" | "result">("list");
  const [availableTests, setAvailableTests] = useState<any[]>([]);
  const [attempts, setAttempts] = useState<Record<string, any>>({});
  const [test, setTest] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [timeLeft, setTimeLeft] = useState(40 * 60); // 40 minutes
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    loadTests();
  }, []);

  const loadTests = async () => {
    setLoading(true);
    try {
      const [tests, results] = await Promise.all([
        apiRequest("/daily-tests"),
        apiRequest("/performance")
      ]);
      setAvailableTests(tests);
      const attemptMap: Record<string, any> = {};
      results.forEach((r: any) => {
        attemptMap[r.testId] = r;
      });
      setAttempts(attemptMap);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const startTest = async (testToStart: any) => {
    if (attempts[testToStart.id]) {
      // Already attempted, show result
      setTest(testToStart);
      setResult(attempts[testToStart.id]);
      setIsSubmitted(true);
      setView("result");
      return;
    }

    setLoading(true);
    try {
      const fullTest = await apiRequest(`/daily-test/${testToStart.id}`);
      setTest(fullTest);
      setCurrentQuestionIndex(0);
      setAnswers({});
      setTimeLeft(40 * 60);
      setIsSubmitted(false);
      setResult(null);
      setView("test");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (view === "test" && test && !isSubmitted && timeLeft > 0) {
      const timer = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
      return () => clearInterval(timer);
    } else if (view === "test" && timeLeft === 0 && !isSubmitted) {
      handleSubmit();
    }
  }, [view, test, isSubmitted, timeLeft]);

  const handleSubmit = async () => {
    if (!test) return;
    
    let correct = 0;
    let wrong = 0;
    let skipped = 0;
    const sectionScores = { Quantitative: 0, DILR: 0, VARC: 0 };

    test.questions.forEach((q: Question) => {
      if (!q) return;
      const ans = answers[q.id];
      if (!ans) {
        skipped++;
      } else if (ans === q.correctAnswer) {
        correct++;
        const section = q.section as keyof typeof sectionScores;
        if (sectionScores[section] !== undefined) {
          sectionScores[section]++;
        }
      } else {
        wrong++;
      }
    });

    const totalScore = Math.round((correct / test.questions.length) * 100);
    
    try {
      const res = await apiRequest("/test-results", {
        method: "POST",
        body: JSON.stringify({
          testId: test.id,
          totalScore,
          correctAnswers: correct,
          wrongAnswers: wrong,
          skippedQuestions: skipped,
          timeSpent: 40 * 60 - timeLeft,
          sectionScores,
          studentAnswers: answers
        })
      });
      setResult(res);
      setIsSubmitted(true);
      setAttempts(prev => ({ ...prev, [test.id]: res }));
      setView("result");
      toast.success("Test submitted successfully!");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  if (loading) return <div className="text-center py-20">Loading...</div>;

  if (view === "list") {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="text-3xl font-bold tracking-tight">Daily Practice</h1>
          <p className="text-muted-foreground">Access your daily practice tests and track your progress.</p>
        </header>

        {availableTests.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 bg-background rounded-xl border border-dashed">
            <div className="bg-orange-100 p-4 rounded-full text-orange-600">
              <AlertCircle size={48} />
            </div>
            <h2 className="text-xl font-bold">No Tests Available</h2>
            <p className="text-muted-foreground max-w-md">There are no daily tests published yet. Please check back later.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {availableTests.map((t) => (
              <Card key={t.id} className="hover:shadow-md transition-all border-t-4 border-t-primary">
                <CardHeader>
                  <div className="flex justify-between items-center mb-2">
                    <Badge variant="outline">{new Date(t.testDate).toLocaleDateString()}</Badge>
                    {attempts[t.id] ? (
                      <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-none">Completed</Badge>
                    ) : (
                      <Badge variant="secondary">Pending</Badge>
                    )}
                  </div>
                  <CardTitle className="text-lg">Daily Practice Test</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    The Daily Sprint for MBA Success. One test per day.
                  </p>
                  {attempts[t.id] && (
                    <div className="flex items-center gap-4 mb-4 p-3 bg-secondary/30 rounded-lg">
                      <div className="text-center flex-1">
                        <p className="text-[10px] uppercase font-bold text-muted-foreground">Score</p>
                        <p className="text-lg font-bold text-primary">{attempts[t.id].totalScore}%</p>
                      </div>
                      <div className="w-px h-8 bg-border" />
                      <div className="text-center flex-1">
                        <p className="text-[10px] uppercase font-bold text-muted-foreground">Correct</p>
                        <p className="text-lg font-bold text-green-600">{attempts[t.id].correctAnswers}</p>
                      </div>
                    </div>
                  )}
                </CardContent>
                <CardFooter>
                  <Button 
                    className="w-full" 
                    variant={attempts[t.id] ? "outline" : "default"}
                    onClick={() => startTest(t)}
                  >
                    {attempts[t.id] ? "View Results" : "Start Test"}
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (view === "result" && result) {
    return (
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => setView("list")}>
            <ChevronRight className="rotate-180" size={16} /> Back to List
          </Button>
        </div>
        <header className="text-center space-y-2">
          <h1 className="text-3xl font-bold">Test Results</h1>
          <p className="text-muted-foreground">Great job completing this practice set!</p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="text-center p-6">
            <p className="text-sm text-muted-foreground mb-1">Score</p>
            <p className="text-3xl font-bold text-primary">{result.totalScore}%</p>
          </Card>
          <Card className="text-center p-6">
            <p className="text-sm text-muted-foreground mb-1">Correct</p>
            <p className="text-3xl font-bold text-green-600">{result.correctAnswers}</p>
          </Card>
          <Card className="text-center p-6">
            <p className="text-sm text-muted-foreground mb-1">Wrong</p>
            <p className="text-3xl font-bold text-red-600">{result.wrongAnswers}</p>
          </Card>
          <Card className="text-center p-6">
            <p className="text-sm text-muted-foreground mb-1">Time</p>
            <p className="text-3xl font-bold">{Math.floor(result.timeSpent / 60)}m {result.timeSpent % 60}s</p>
          </Card>
        </div>

        <div className="space-y-6">
          <h2 className="text-xl font-bold">Review Questions</h2>
          {test?.questions?.map((q: Question, idx: number) => (
            <Card key={q.id} className={`border-l-4 ${
              result.studentAnswers[q.id] === q.correctAnswer ? "border-l-green-500" : 
              !result.studentAnswers[q.id] ? "border-l-yellow-500" : "border-l-red-500"
            }`}>
              <CardHeader className="pb-2">
                <div className="flex justify-between items-center mb-2">
                  <Badge variant="outline">{q.section}</Badge>
                  {result.studentAnswers[q.id] === q.correctAnswer ? (
                    <span className="text-green-600 flex items-center gap-1 text-xs font-bold"><CheckCircle2 size={14} /> Correct</span>
                  ) : !result.studentAnswers[q.id] ? (
                    <span className="text-yellow-600 flex items-center gap-1 text-xs font-bold"><AlertCircle size={14} /> Skipped</span>
                  ) : (
                    <span className="text-red-600 flex items-center gap-1 text-xs font-bold"><XCircle size={14} /> Incorrect</span>
                  )}
                </div>
                <CardTitle className="text-base">Q{idx + 1}: {q.questionText}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-2">
                  {q.options.map((opt) => (
                    <div 
                      key={opt} 
                      className={`p-3 rounded-lg border text-sm ${
                        opt === q.correctAnswer ? "bg-green-50 border-green-200 text-green-800 font-medium" :
                        opt === result.studentAnswers[q.id] ? "bg-red-50 border-red-200 text-red-800" : "bg-secondary/20"
                      }`}
                    >
                      {opt}
                    </div>
                  ))}
                </div>
                <div className="bg-secondary/30 p-4 rounded-lg text-sm">
                  <p className="font-bold mb-1">Explanation:</p>
                  <p className="text-muted-foreground">{q.explanation}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const currentQ = test.questions[currentQuestionIndex];
  if (!currentQ) return <div className="text-center py-20">Error: Question not found.</div>;
  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8 sticky top-0 bg-background/80 backdrop-blur-md p-4 rounded-xl border z-10 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="bg-primary/10 text-primary px-3 py-1 rounded-full font-bold text-sm">
            Q {currentQuestionIndex + 1} / {test.questions.length}
          </div>
          <div className="hidden sm:block">
            <Badge variant="secondary">{currentQ.section}</Badge>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className={`flex items-center gap-2 font-mono font-bold ${timeLeft < 300 ? "text-red-500 animate-pulse" : "text-primary"}`}>
            <Clock size={20} />
            {formatTime(timeLeft)}
          </div>
          <Button variant="destructive" size="sm" onClick={handleSubmit}>Submit Test</Button>
        </div>
      </div>

      <div className="space-y-8">
        <Card className="border-none shadow-xl">
          <CardHeader>
            <CardTitle className="text-xl md:text-2xl leading-relaxed">
              {currentQ.questionText}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <RadioGroup 
              value={answers[currentQ.id] || ""} 
              onValueChange={(val) => setAnswers(prev => ({ ...prev, [currentQ.id]: val }))}
              className="grid grid-cols-1 gap-3"
            >
              {currentQ.options.map((opt, idx) => (
                <Label 
                  key={opt}
                  className={`flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    answers[currentQ.id] === opt 
                      ? "border-primary bg-primary/5 ring-1 ring-primary" 
                      : "hover:border-primary/30 hover:bg-secondary/50"
                  }`}
                >
                  <RadioGroupItem value={opt} id={`q-${idx}`} className="sr-only" />
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold border ${
                    answers[currentQ.id] === opt ? "bg-primary text-white border-primary" : "bg-secondary text-muted-foreground"
                  }`}>
                    {String.fromCharCode(65 + idx)}
                  </div>
                  <span className="text-base font-medium">{opt}</span>
                </Label>
              ))}
            </RadioGroup>
          </CardContent>
          <CardFooter className="flex justify-between border-t p-6">
            <Button 
              variant="outline" 
              onClick={() => setCurrentQuestionIndex(prev => Math.max(0, prev - 1))}
              disabled={currentQuestionIndex === 0}
            >
              Previous
            </Button>
            <div className="flex gap-2">
              <Button 
                variant="ghost" 
                onClick={() => setAnswers(prev => {
                  const newAns = { ...prev };
                  delete newAns[currentQ.id];
                  return newAns;
                })}
              >
                Clear
              </Button>
              <Button 
                onClick={() => {
                  if (currentQuestionIndex < test.questions.length - 1) {
                    setCurrentQuestionIndex(prev => prev + 1);
                  } else {
                    handleSubmit();
                  }
                }}
              >
                {currentQuestionIndex === test.questions.length - 1 ? "Finish" : "Next Question"}
              </Button>
            </div>
          </CardFooter>
        </Card>

        <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
          {test.questions.map((_: any, idx: number) => (
            <button
              key={idx}
              onClick={() => setCurrentQuestionIndex(idx)}
              className={`h-10 rounded-lg font-bold text-xs transition-all ${
                currentQuestionIndex === idx ? "ring-2 ring-primary ring-offset-2" : ""
              } ${
                answers[test.questions[idx].id] ? "bg-primary text-white" : "bg-secondary text-muted-foreground"
              }`}
            >
              {idx + 1}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function TestHistory({ user }: { user: UserProfile }) {
  const [results, setResults] = useState<any[]>([]);
  const [reviewingResult, setReviewingResult] = useState<any | null>(null);
  const [reviewingTest, setReviewingTest] = useState<any | null>(null);
  const [loadingReview, setLoadingReview] = useState(false);
  useEffect(() => {
    apiRequest("/performance").then(setResults);
  }, []);
const handleReview = async (res: any) => {
    setLoadingReview(true);
    setReviewingResult(res);
    try {
      const testData = await apiRequest(`/daily-test/${res.testId}`);
      setReviewingTest(testData);
    } catch (err: any) {
      toast.error("Failed to load test details for review.");
      setReviewingResult(null);
    } finally {
      setLoadingReview(false);
    }
  };

  if (loadingReview) return <div className="text-center py-20">Loading review...</div>;

  if (reviewingResult && reviewingTest) {
    return (
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => { setReviewingResult(null); setReviewingTest(null); }}>
            <ChevronRight className="rotate-180" size={16} /> Back to History
          </Button>
        </div>
        <header className="text-center space-y-2">
          <h1 className="text-3xl font-bold">Test Results</h1>
          <p className="text-muted-foreground">Review your past practice attempt!</p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="text-center p-6">
            <p className="text-sm text-muted-foreground mb-1">Score</p>
            <p className="text-3xl font-bold text-primary">{reviewingResult.totalScore}%</p>
          </Card>
          <Card className="text-center p-6">
            <p className="text-sm text-muted-foreground mb-1">Correct</p>
            <p className="text-3xl font-bold text-green-600">{reviewingResult.correctAnswers}</p>
          </Card>
          <Card className="text-center p-6">
            <p className="text-sm text-muted-foreground mb-1">Wrong</p>
            <p className="text-3xl font-bold text-red-600">{reviewingResult.wrongAnswers}</p>
          </Card>
          <Card className="text-center p-6">
            <p className="text-sm text-muted-foreground mb-1">Time</p>
            <p className="text-3xl font-bold">{Math.floor(reviewingResult.timeSpent / 60)}m {reviewingResult.timeSpent % 60}s</p>
          </Card>
        </div>

        <div className="space-y-6">
          <h2 className="text-xl font-bold">Review Questions</h2>
          {reviewingTest?.questions?.map((q: Question, idx: number) => (
            <Card key={q.id} className={`border-l-4 ${
              reviewingResult.studentAnswers[q.id] === q.correctAnswer ? "border-l-green-500" : 
              !reviewingResult.studentAnswers[q.id] ? "border-l-yellow-500" : "border-l-red-500"
            }`}>
              <CardHeader className="pb-2">
                <div className="flex justify-between items-center mb-2">
                  <Badge variant="outline">{q.section}</Badge>
                  {reviewingResult.studentAnswers[q.id] === q.correctAnswer ? (
                    <span className="text-green-600 flex items-center gap-1 text-xs font-bold"><CheckCircle2 size={14} /> Correct</span>
                  ) : !reviewingResult.studentAnswers[q.id] ? (
                    <span className="text-yellow-600 flex items-center gap-1 text-xs font-bold"><AlertCircle size={14} /> Skipped</span>
                  ) : (
                    <span className="text-red-600 flex items-center gap-1 text-xs font-bold"><XCircle size={14} /> Incorrect</span>
                  )}
                </div>
                <CardTitle className="text-base">Q{idx + 1}: {q.questionText}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-2">
                  {q.options.map((opt) => (
                    <div 
                      key={opt} 
                      className={`p-3 rounded-lg border text-sm ${
                        opt === q.correctAnswer ? "bg-green-50 border-green-200 text-green-800 font-medium" :
                        opt === reviewingResult.studentAnswers[q.id] ? "bg-red-50 border-red-200 text-red-800" : "bg-secondary/20"
                      }`}
                    >
                      {opt}
                    </div>
                  ))}
                </div>
                <div className="bg-secondary/30 p-4 rounded-lg text-sm">
                  <p className="font-bold mb-1">Explanation:</p>
                  <p className="text-muted-foreground">{q.explanation}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Test History</h1>
        <p className="text-muted-foreground">Review your past performance and learn from mistakes.</p>
      </header>

      <div className="space-y-4">
        {results.map((res) => (
          <Card key={res.id} className="hover:shadow-md transition-all">
            <CardContent className="p-6 flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className={`w-16 h-16 rounded-2xl flex flex-col items-center justify-center text-white font-bold ${
                  res.totalScore >= 80 ? "bg-green-500" : res.totalScore >= 50 ? "bg-orange-500" : "bg-red-500"
                }`}>
                  <span className="text-xl">{res.totalScore}</span>
                  <span className="text-[10px] opacity-80">%</span>
                </div>
                <div>
                  <h3 className="font-bold text-lg">Daily Practice Test</h3>
                  <p className="text-sm text-muted-foreground">{new Date(res.testDate).toLocaleDateString()} • {Math.floor(res.timeSpent / 60)}m spent</p>
                </div>
              </div>
              <div className="flex gap-8 text-center">
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-bold">Correct</p>
                  <p className="font-bold text-green-600">{res.correctAnswers}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-bold">Wrong</p>
                  <p className="font-bold text-red-600">{res.wrongAnswers}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-bold">Skipped</p>
                  <p className="font-bold text-slate-500">{res.skippedQuestions}</p>
                </div>
              </div>
                          <Button variant="outline" className="gap-2" onClick={() => handleReview(res)}>
                <Search size={16} />
                Review
              </Button>
            </CardContent>
          </Card>
        ))}
        {results.length === 0 && (
          <div className="text-center py-20 bg-background rounded-2xl border border-dashed">
            <p className="text-muted-foreground">No test results found. Start your first practice test today!</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Analytics({ user }: { user: UserProfile }) {
  const [results, setResults] = useState<any[]>([]);

  useEffect(() => {
    apiRequest("/performance").then(setResults);
  }, []);

  const chartData = useMemo(() => {
    return results.slice(-10).map(r => ({
      date: new Date(r.testDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      score: r.totalScore
    }));
  }, [results]);

  const sectionData = useMemo(() => {
    if (results.length === 0) return [];
    const totals = { Quantitative: 0, DILR: 0, VARC: 0 };
    results.forEach(r => {
      totals.Quantitative += r.sectionScores.Quantitative;
      totals.DILR += r.sectionScores.DILR;
      totals.VARC += r.sectionScores.VARC;
    });
    return [
      { name: "Quantitative", value: totals.Quantitative, color: "#3b82f6" },
      { name: "DILR", value: totals.DILR, color: "#f59e0b" },
      { name: "VARC", value: totals.VARC, color: "#8b5cf6" },
    ];
  }, [results]);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Performance Analytics</h1>
        <p className="text-muted-foreground">Visualize your progress and identify areas for improvement.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card className="p-6">
          <CardHeader className="px-0 pt-0">
            <CardTitle>Score Trend (Last 10 Tests)</CardTitle>
          </CardHeader>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" />
                <YAxis domain={[0, 100]} />
                <Tooltip />
                <Line type="monotone" dataKey="score" stroke="#3b82f6" strokeWidth={3} dot={{ r: 6 }} activeDot={{ r: 8 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-6">
          <CardHeader className="px-0 pt-0">
            <CardTitle>Section-wise Performance</CardTitle>
          </CardHeader>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sectionData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {sectionData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-6 text-center">
          <p className="text-sm text-muted-foreground font-bold uppercase mb-2">Overall Accuracy</p>
          <div className="text-4xl font-black text-primary">
        {results?.length > 0 ? Math.round(results.reduce((a, b) => a + Number(b.totalScore), 0) / results.length): 0}%
          </div>
        </Card>
        <Card className="p-6 text-center">
          <p className="text-sm text-muted-foreground font-bold uppercase mb-2">Total Questions</p>
          <div className="text-4xl font-black">
            {results.length * 20}
          </div>
        </Card>
      </div>
    </div>
  );
}

function AdminDashboard({ user }: { user: UserProfile }) {
  const [unverified, setUnverified] = useState<any[]>([]);
  const [approved, setApproved] = useState<any[]>([]);
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [activeTab, setActiveTab] = useState("queue");
  const [newMaterial, setNewMaterial] = useState({ topicName: "", section: "Quantitative", googleSheetLink: "", googleDriveLink: "", description: "" });
  const [newVideo, setNewVideo] = useState({ topicName: "", section: "Quantitative", googleSheetLink: "", googleDriveLink: "", duration: "", instructorName: "" });

  useEffect(() => {
    refreshQueue();
  }, []);

  const refreshQueue = async () => {
    const [uv, ap] = await Promise.all([
      apiRequest("/unverified-questions"),
      apiRequest("/approved-questions")
    ]);
    
    // Filter out questions that are already approved (since deleting from Sheets is non-trivial)
    const approvedIds = new Set(ap.map((q: any) => q.id));
    const filteredUnverified = uv.filter((q: any) => !approvedIds.has(q.id));
    
    setUnverified(filteredUnverified);
    setApproved(ap);
  };

  const handleAddMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest("/course-materials", {
        method: "POST",
        body: JSON.stringify({ ...newMaterial, id: `CM${Date.now()}`, dateAdded: new Date().toISOString() })
      });
      toast.success("Course material added to Google Sheet!");
      setNewMaterial({ topicName: "", section: "Quant", googleSheetLink: "", googleDriveLink: "", description: "" });
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleAddVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest("/video-lectures", {
        method: "POST",
        body: JSON.stringify({ ...newVideo, id: `VL${Date.now()}`, dateUploaded: new Date().toISOString() })
      });
      toast.success("Video lecture added to Google Sheet!");
      setNewVideo({ topicName: "", section: "Quant", googleSheetLink: "", googleDriveLink: "", duration: "", instructorName: "" });
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const response = await fetch("/api/generate-questions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${localStorage.getItem("token")}`
  }
});
const questions = await response.json();
      await apiRequest("/questions/save-unverified", {
        method: "POST",
        body: JSON.stringify({ questions })
      });
      refreshQueue();
      toast.success("Generated 20 new questions!");
    } catch (err: any) {
      toast.error("Generation failed: " + err.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleVerify = async (ids: string[], action: 'approve' | 'reject') => {
    try {
      await apiRequest("/questions/verify", {
        method: "POST",
        body: JSON.stringify({ questionIds: ids, action })
      });
      refreshQueue();
      toast.success(`Questions ${action}ed successfully`);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handlePublishTest = async () => {
    if (approved.length < 20) {
      toast.error(`Need at least 20 approved questions. You have ${approved.length}.`);
      return;
    }

    setPublishing(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      // Pick 20 most recent approved questions
      const selectedIds = approved.slice(-20).map(q => q.id);
      
      await apiRequest("/daily-test/publish", {
        method: "POST",
        body: JSON.stringify({
          testDate: today,
          questionIds: selectedIds
        })
      });
      
      toast.success("Today's test published to Google Sheets!");
    } catch (err: any) {
      toast.error("Publication failed: " + err.message);
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
          <p className="text-muted-foreground">Manage questions, students, and system settings.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handlePublishTest} disabled={publishing || approved.length < 20} className="gap-2 h-11 px-6">
            <CheckCircle2 size={20} className="text-green-500" />
            {publishing ? "Publishing..." : "Publish Today's Test"}
          </Button>
          <Button onClick={handleGenerate} disabled={generating} className="gap-2 h-11 px-6">
            <BrainCircuit size={20} />
            {generating ? "Generating with AI..." : "AI Generate Questions"}
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-3 space-y-6">
          <Tabs defaultValue="queue" className="w-full">
            <TabsList>
              <TabsTrigger value="queue" className="gap-2">
                Queue <Badge variant="secondary">{unverified.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="approved" className="gap-2">
                Approved <Badge variant="secondary">{approved.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="resources" className="gap-2">
                Resources
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="resources" className="space-y-6 pt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <BookOpen size={18} className="text-primary" />
                      Add Course Material
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleAddMaterial} className="space-y-3">
                      <Input placeholder="Topic Name" value={newMaterial.topicName} onChange={e => setNewMaterial({...newMaterial, topicName: e.target.value})} required />
                      <select className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm" value={newMaterial.section} onChange={e => setNewMaterial({...newMaterial, section: e.target.value})}>
                        <option value="Quantitative">Quantitative</option>
                        <option value="VARC">VARC</option>
                        <option value="DILR">DILR</option>
                      </select>
                      <Input placeholder="Google Sheets Link" value={newMaterial.googleSheetLink} onChange={e => setNewMaterial({...newMaterial, googleSheetLink: e.target.value})} required />
                      <Input placeholder="Google Drive Link" value={newMaterial.googleDriveLink} onChange={e => setNewMaterial({...newMaterial, googleDriveLink: e.target.value})} />
                      <textarea className="w-full p-3 rounded-md border border-input bg-background text-sm min-h-[80px]" placeholder="Description" value={newMaterial.description} onChange={e => setNewMaterial({...newMaterial, description: e.target.value})} />
                      <Button type="submit" className="w-full">Save to Sheet</Button>
                    </form>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Presentation size={18} className="text-red-500" />
                      Add Video Lecture
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleAddVideo} className="space-y-3">
                      <Input placeholder="Video Topic" value={newVideo.topicName} onChange={e => setNewVideo({...newVideo, topicName: e.target.value})} required />
                      <select className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm" value={newVideo.section} onChange={e => setNewVideo({...newVideo, section: e.target.value})}>
                        <option value="Quantitative">Quantitative</option>
                        <option value="VARC">VARC</option>
                        <option value="DILR">DILR</option>
                      </select>
                      <Input placeholder="Video Link (Drive/YT)" value={newVideo.googleDriveLink} onChange={e => setNewVideo({...newVideo, googleDriveLink: e.target.value})} required />
                      <div className="grid grid-cols-2 gap-2">
                        <Input placeholder="Duration (e.g. 15m)" value={newVideo.duration} onChange={e => setNewVideo({...newVideo, duration: e.target.value})} />
                        <Input placeholder="Instructor" value={newVideo.instructorName} onChange={e => setNewVideo({...newVideo, instructorName: e.target.value})} />
                      </div>
                      <Button type="submit" className="w-full">Save to Sheet</Button>
                    </form>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
            
            <TabsContent value="queue" className="space-y-4 pt-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <ClipboardList size={20} className="text-primary" />
                  Verification Queue
                </h2>
                {unverified.length > 0 && (
                  <Button size="sm" onClick={() => handleVerify(unverified.map(q => q.id), 'approve')}>Approve All</Button>
                )}
              </div>

              {unverified.map((q) => q && (
                <Card key={q.id}>
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                      <Badge>{q.section}</Badge>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => handleVerify([q.id], 'reject')} className="text-red-500 hover:text-red-600">Reject</Button>
                        <Button size="sm" onClick={() => handleVerify([q.id], 'approve')}>Approve</Button>
                      </div>
                    </div>
                    <CardTitle className="text-base mt-2">{q.questionText}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-2 mb-4">
                      {q.options.map((opt: string) => (
                        <div key={opt} className={`p-2 rounded border text-xs ${opt === q.correctAnswer ? "bg-green-50 border-green-200 font-bold" : ""}`}>
                          {opt}
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground bg-secondary/30 p-3 rounded">
                      <span className="font-bold">Explanation:</span> {q.explanation}
                    </p>
                  </CardContent>
                </Card>
              ))}
              {unverified.length === 0 && (
                <div className="text-center py-20 bg-background rounded-2xl border border-dashed">
                  <p className="text-muted-foreground">Queue is empty. AI Generate new questions to begin.</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="approved" className="space-y-4 pt-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <ShieldCheck size={20} className="text-green-500" />
                  Approved Repository
                </h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {approved.slice().reverse().slice(0, 20).map((q) => q && (
                  <Card key={q.id} className="opacity-80">
                    <CardHeader className="p-4 pb-2">
                      <div className="flex justify-between">
                        <Badge variant="outline">{q.section}</Badge>
                        <span className="text-[10px] text-muted-foreground">{new Date(q.approvedDate).toLocaleDateString()}</span>
                      </div>
                      <CardTitle className="text-sm line-clamp-2 mt-1">{q.questionText}</CardTitle>
                    </CardHeader>
                  </Card>
                ))}
              </div>
              {approved.length === 0 && (
                <div className="text-center py-20 bg-background rounded-2xl border border-dashed">
                  <p className="text-muted-foreground">No approved questions yet.</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        <div className="space-y-6">
          <h2 className="text-xl font-bold">Quick Actions</h2>
          <div className="space-y-3">
            <Button variant="outline" className="w-full justify-start gap-3 h-12">
              <User size={18} />
              Manage Students
            </Button>
            <Button variant="outline" className="w-full justify-start gap-3 h-12">
              <BookOpen size={18} />
              Add Course Material
            </Button>
            <Button variant="outline" className="w-full justify-start gap-3 h-12">
              <Video size={18} />
              Upload Lecture
            </Button>
            <Button variant="outline" className="w-full justify-start gap-3 h-12">
              <AlertCircle size={18} />
              Post Announcement
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
