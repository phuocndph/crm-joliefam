import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  Clock, 
  RefreshCw, 
  Brain,
  ShoppingCart,
  Phone,
  User
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface PredictiveAnalyticsCellProps {
  customer: any;
}

interface Prediction {
  type: string;
  value: number;
  confidence: number;
  factors: any;
}

const PredictiveAnalyticsCell = ({ customer }: PredictiveAnalyticsCellProps) => {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const { toast } = useToast();

  // Load predictions on mount
  useEffect(() => {
    loadPredictions();
  }, [customer.id]);

  const loadPredictions = async () => {
    try {
      const { data, error } = await supabase
        .from('customer_predictions')
        .select('*')
        .eq('customer_id', customer.id)
        .gt('valid_until', new Date().toISOString());

      if (error) throw error;

      if (data && data.length > 0) {
        const formattedPredictions = data.map(p => ({
          type: p.prediction_type,
          value: p.prediction_value,
          confidence: p.confidence_score,
          factors: p.factors
        }));
        setPredictions(formattedPredictions);
      } else {
        // Generate new predictions if none exist
        await generatePredictions();
      }
    } catch (error) {
      console.error('Error loading predictions:', error);
    }
  };

  const generatePredictions = async () => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase.functions.invoke('predictive-analytics', {
        body: { 
          customer_id: customer.id,
          prediction_types: ['purchase_probability', 'churn_risk', 'optimal_contact_time']
        }
      });

      if (error) throw error;

      if (data && data.predictions) {
        setPredictions(data.predictions);
        toast({
          title: "Predictions Updated",
          description: "AI đã phân tích và cập nhật dự đoán cho khách hàng",
        });
      }
    } catch (error) {
      console.error('Error generating predictions:', error);
      toast({
        title: "Lỗi AI",
        description: "Không thể tạo dự đoán, vui lòng thử lại",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getPrediction = (type: string) => {
    return predictions.find(p => p.type === type);
  };

  const getPurchaseProbability = () => getPrediction('purchase_probability');
  const getChurnRisk = () => getPrediction('churn_risk');
  const getOptimalTime = () => getPrediction('optimal_contact_time');

  const getPurchaseIcon = () => {
    const prediction = getPurchaseProbability();
    if (!prediction) return <ShoppingCart className="h-4 w-4 text-gray-400" />;
    
    if (prediction.value >= 70) return <TrendingUp className="h-4 w-4 text-green-600" />;
    if (prediction.value >= 40) return <TrendingUp className="h-4 w-4 text-yellow-600" />;
    return <TrendingDown className="h-4 w-4 text-red-600" />;
  };

  const getChurnIcon = () => {
    const prediction = getChurnRisk();
    if (!prediction) return <User className="h-4 w-4 text-gray-400" />;
    
    if (prediction.value >= 70) return <AlertTriangle className="h-4 w-4 text-red-600" />;
    if (prediction.value >= 40) return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
    return <User className="h-4 w-4 text-green-600" />;
  };

  const getOptimalTimeIcon = () => {
    const prediction = getOptimalTime();
    if (!prediction) return <Clock className="h-4 w-4 text-gray-400" />;
    return <Phone className="h-4 w-4 text-blue-600" />;
  };

  const getScoreColor = (score: number, isRisk: boolean = false) => {
    if (isRisk) {
      // For risk scores, high is bad
      if (score >= 70) return 'text-red-600 bg-red-50 border-red-200';
      if (score >= 40) return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      return 'text-green-600 bg-green-50 border-green-200';
    } else {
      // For probability scores, high is good
      if (score >= 70) return 'text-green-600 bg-green-50 border-green-200';
      if (score >= 40) return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      return 'text-red-600 bg-red-50 border-red-200';
    }
  };

  const formatTime = (hour: number) => {
    return `${hour}:00`;
  };

  if (predictions.length === 0 && !loading) {
    return (
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={generatePredictions}
          className="h-8 px-2"
        >
          <Brain className="h-4 w-4 mr-1" />
          Phân tích AI
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Popover open={showDetails} onOpenChange={setShowDetails}>
        <PopoverTrigger asChild>
          <div className="flex items-center gap-1 cursor-pointer">
            {getPurchaseIcon()}
            {getChurnIcon()}
            {getOptimalTimeIcon()}
            <Brain className="h-3 w-3 text-purple-500" />
          </div>
        </PopoverTrigger>
        <PopoverContent className="w-80" align="start">
          <Card className="border-0 shadow-none">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Brain className="h-4 w-4 text-purple-600" />
                AI Predictions - {customer.name}
              </CardTitle>
              <CardDescription className="text-xs">
                Dự đoán được tạo bởi AI dựa trên dữ liệu khách hàng
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Purchase Probability */}
              {getPurchaseProbability() && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShoppingCart className="h-4 w-4 text-green-600" />
                      <span className="text-sm font-medium">Khả năng mua hàng</span>
                    </div>
                    <Badge variant="outline" className={getScoreColor(getPurchaseProbability()!.value)}>
                      {getPurchaseProbability()!.value}%
                    </Badge>
                  </div>
                  <Progress value={getPurchaseProbability()!.value} className="h-2" />
                  <p className="text-xs text-muted-foreground">
                    Confidence: {getPurchaseProbability()!.confidence}%
                  </p>
                </div>
              )}

              {/* Churn Risk */}
              {getChurnRisk() && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-red-600" />
                      <span className="text-sm font-medium">Nguy cơ Lost</span>
                    </div>
                    <Badge variant="outline" className={getScoreColor(getChurnRisk()!.value, true)}>
                      {getChurnRisk()!.value}%
                    </Badge>
                  </div>
                  <Progress value={getChurnRisk()!.value} className="h-2" />
                  <p className="text-xs text-muted-foreground">
                    Confidence: {getChurnRisk()!.confidence}%
                  </p>
                </div>
              )}

              {/* Optimal Contact Time */}
              {getOptimalTime() && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-blue-600" />
                      <span className="text-sm font-medium">Thời gian tối ưu</span>
                    </div>
                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                      {formatTime(getOptimalTime()!.value)}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Confidence: {getOptimalTime()!.confidence}%
                  </p>
                </div>
              )}

              {/* Refresh Button */}
              <div className="pt-2 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={generatePredictions}
                  disabled={loading}
                  className="w-full"
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                  {loading ? 'Đang phân tích...' : 'Cập nhật dự đoán'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </PopoverContent>
      </Popover>

      {/* Quick indicators */}
      <div className="flex gap-1">
        {getPurchaseProbability() && getPurchaseProbability()!.value >= 70 && (
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs">
            🎯 High Buy
          </Badge>
        )}
        {getChurnRisk() && getChurnRisk()!.value >= 70 && (
          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-xs">
            ⚠️ Risk Lost
          </Badge>
        )}
      </div>
    </div>
  );
};

export default PredictiveAnalyticsCell;